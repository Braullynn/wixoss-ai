import subprocess
import json
import os
import torch
import numpy as np
import time
import argparse
import sys
from dql_agent import DQNAgent
from replay_buffer import ReplayBuffer

def run_training():
    parser = argparse.ArgumentParser(description="Wixoss DQL Training Script")
    parser.add_argument("--episodes", type=int, default=100000, help="Número de episódios para treinar")
    parser.add_argument("--output", type=str, default="./training_results", help="Pasta para salvar os resultados")
    parser.add_argument("--batch_size", type=int, default=64, help="Tamanho do batch de treino")
    args = parser.parse_args()

    # Configurações do Treino baseado nos argumentos
    OUTPUT_PATH = args.output
    CHECKPOINT_FILE = os.path.join(OUTPUT_PATH, "checkpoint.pt")
    BUFFER_FILE = os.path.join(OUTPUT_PATH, "replay_buffer.pkl")
    METRICS_FILE = os.path.join(OUTPUT_PATH, "metrics.json")

    STATE_SIZE = 62
    ACTION_SIZE = 40
    BATCH_SIZE = args.batch_size
    EPISODES_PER_SAVE = 10
    TARGET_UPDATE_FREQ = 500

    # 1. Garantir diretório de saída
    if not os.path.exists(OUTPUT_PATH):
        os.makedirs(OUTPUT_PATH, exist_ok=True)
        print(f"Pasta de resultados: {OUTPUT_PATH}", flush=True)

    # 2. Inicializar Agente e Buffer
    agent = DQNAgent(STATE_SIZE, ACTION_SIZE)
    buffer = ReplayBuffer(ACTION_SIZE, buffer_size=50000, batch_size=BATCH_SIZE)
    
    start_episode = 0
    total_wins = 0
    total_games = 0
    history = {"wins": [], "rewards": [], "epsilons": []}

    # 3. Auto-Resume: Carregar progresso anterior
    if os.path.exists(CHECKPOINT_FILE):
        print(f"Conhecimento previo encontrado! Carregando {CHECKPOINT_FILE}...", flush=True)
        agent.load(CHECKPOINT_FILE)
        if os.path.exists(METRICS_FILE):
            try:
                with open(METRICS_FILE, 'r') as f:
                    metrics = json.load(f)
                    start_episode = metrics.get("episode", 0)
                    total_wins = metrics.get("total_wins", 0)
                    total_games = metrics.get("total_games", 0)
                    history = metrics.get("history", history)
                print(f"Resumindo do episodio {start_episode}. Record: {total_wins}/{total_games} Vitorias.", flush=True)
            except Exception as e:
                print(f"Erro ao carregar metricas: {e}. Iniciando do episodio atual.", flush=True)
        
        if os.path.exists(BUFFER_FILE):
            print("Carregando Replay Buffer...", flush=True)
            buffer.load(BUFFER_FILE)
    else:
        print("Iniciando novo treinamento.", flush=True)

    # 4. Loop de Episódios
    global_step = 0
    max_episodes = start_episode + args.episodes
    
    try:
        for episode in range(start_episode, max_episodes):
            print(f"--- Iniciando EP {episode:04d} ---", flush=True)
            ep_start_time = time.time()
            node_cmd = ["node", "headless/HeadlessRunner.js", "--ml-training"]
            process = subprocess.Popen(
                node_cmd, 
                stdin=subprocess.PIPE, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE, # Capturar stderr para ver erros do Node
                text=True,
                bufsize=1,
                shell=(os.name == 'nt')
            )

            current_reward = 0
            last_state = None
            last_action = None
            last_mask = None
            
            # Thread para printar stderr do Node em tempo real (opcional, vamos simplificar)
            
            while True:
                line = process.stdout.readline()
                if not line: 
                    # Se o processo fechou, verifique se houve erro no stderr
                    err = process.stderr.read()
                    if err: print(f"  [NODE ERR] {err}", flush=True)
                    break 
                
                try:
                    data = json.loads(line)
                except:
                    # Logs não JSON do Node aparecem aqui
                    print(f"  [NODE LOG] {line.strip()}", flush=True)
                    continue 

                if data["type"] == "decision":
                    state = np.array(data["state"])
                    mask = np.array(data["mask"])
                    advisor_idx = data.get("advisor", -1)
                    
                    if last_state is not None:
                        buffer.add(last_state, last_action, data["reward"], state, False, last_mask)
                        current_reward += data["reward"]
                    
                    action_idx = agent.act(state, mask, advisor_idx)
                    
                    action_labels = data.get("available_actions", [])
                    action_name = action_labels[action_idx] if action_idx < len(action_labels) else f"Acao {action_idx}"
                    print(f"  [STEP] Decisao IA: {action_name}", flush=True)
                    process.stdin.write(json.dumps({"action": int(action_idx)}) + "\n")
                    process.stdin.flush()
                    
                    last_state = state
                    last_action = action_idx
                    last_mask = mask
                    
                    if len(buffer) > BATCH_SIZE:
                        agent.learn(buffer.sample())
                        global_step += 1
                        if global_step % TARGET_UPDATE_FREQ == 0:
                            agent.update_target_network()

                elif data["type"] == "game_over":
                    if last_state is not None:
                        final_reward = data["reward"]
                        buffer.add(last_state, last_action, final_reward, last_state, True, last_mask)
                        current_reward += final_reward
                    
                    total_games += 1
                    if data["result"] == "WIN":
                        total_wins += 1
                    
                    win_rate = (total_wins / total_games) * 100 if total_games > 0 else 0
                    duration = time.time() - ep_start_time
                    session_count = episode - start_episode + 1
                    print(f"FINALIZADO EP {episode:04d} ({session_count}/{args.episodes}) | {data['result']} | Time: {duration:.1f}s | Reward: {current_reward:+.2f} | WR: {win_rate:.1f}%", flush=True)
                    
                    history["wins"].append(1 if data["result"] == "WIN" else 0)
                    history["rewards"].append(current_reward)
                    history["epsilons"].append(agent.epsilon)
                    break

            process.wait()

            # --- Salvamento de Progresso ---
            # 1. Metricas e Episodio (Leve: salvar sempre)
            metrics = {
                "episode": episode + 1,
                "total_wins": total_wins,
                "total_games": total_games,
                "history": history
            }
            with open(METRICS_FILE, 'w') as f:
                json.dump(metrics, f)

            # 2. Checkpoints do Modelo (Pesado: salvar a cada X episodios)
            if (episode + 1) % EPISODES_PER_SAVE == 0 or (episode + 1) == max_episodes:
                print(f"Salvando Checkpoint do Modelo em {OUTPUT_PATH}...", flush=True)
                agent.save(CHECKPOINT_FILE)
                buffer.save(BUFFER_FILE)

    except KeyboardInterrupt:
        print("\nTreinamento interrompido pelo usuario.", flush=True)
    except Exception as e:
        print(f"\nErro fatal durante o treino: {e}", flush=True)

if __name__ == "__main__":
    run_training()
