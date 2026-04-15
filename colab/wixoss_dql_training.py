import subprocess
import json
import os
import torch
import numpy as np
import time
from dql_agent import DQNAgent
from replay_buffer import ReplayBuffer

# Configurações do Treino
DRIVE_PATH = "/content/drive/MyDrive/wixoss-dql"
CHECKPOINT_FILE = os.path.join(DRIVE_PATH, "checkpoint.pt")
BUFFER_FILE = os.path.join(DRIVE_PATH, "replay_buffer.pkl")
METRICS_FILE = os.path.join(DRIVE_PATH, "metrics.json")

STATE_SIZE = 62
ACTION_SIZE = 40
BATCH_SIZE = 64
EPISODES_PER_SAVE = 10
TARGET_UPDATE_FREQ = 500  # Atualiza target network a cada 500 steps

def run_training():
    # 1. Garantir diretório do Drive
    if not os.path.exists(DRIVE_PATH):
        try:
            os.makedirs(DRIVE_PATH, exist_ok=True)
            print(f"📁 Pasta criada no Drive: {DRIVE_PATH}")
        except:
            print("⚠️ Aviso: Não foi possível acessar o Google Drive. Salvando localmente.")

    # 2. Inicializar Agente e Buffer
    agent = DQNAgent(STATE_SIZE, ACTION_SIZE, batch_size=BATCH_SIZE)
    buffer = ReplayBuffer(ACTION_SIZE, buffer_size=50000, batch_size=BATCH_SIZE)
    
    start_episode = 0
    total_wins = 0
    total_games = 0
    history = {"wins": [], "rewards": [], "epsilons": []}

    # 3. Auto-Resume: Carregar progresso anterior
    if os.path.exists(CHECKPOINT_FILE):
        print(f"🧠 Conhecimento prévio encontrado! Carregando {CHECKPOINT_FILE}...")
        agent.load(CHECKPOINT_FILE)
        if os.path.exists(METRICS_FILE):
            with open(METRICS_FILE, 'r') as f:
                metrics = json.load(f)
                start_episode = metrics.get("episode", 0)
                total_wins = metrics.get("total_wins", 0)
                total_games = metrics.get("total_games", 0)
                history = metrics.get("history", history)
            print(f"📈 Resumindo do episódio {start_episode}. Record: {total_wins}/{total_games} Vitórias.")
        
        if os.path.exists(BUFFER_FILE):
            print("💾 Carregando Replay Buffer...")
            buffer.load(BUFFER_FILE)
    else:
        print("🆕 Iniciando novo treinamento do zero.")

    # 4. Loop de Episódios
    global_step = 0
    
    try:
        for episode in range(start_episode, 100000):
            # Iniciar partida no Node.js
            # Path assume execução dentro de ml-training/
            node_cmd = ["node", "headless/HeadlessRunner.js", "--ml-training"]
            process = subprocess.Popen(
                node_cmd, 
                stdin=subprocess.PIPE, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1
            )

            current_reward = 0
            last_state = None
            last_action = None
            last_mask = None
            
            # Loop de decisão dentro do jogo
            while True:
                line = process.stdout.readline()
                if not line: break
                
                try:
                    data = json.loads(line)
                except:
                    continue # Ignorar logs não-JSON (se houver)

                if data["type"] == "decision":
                    state = np.array(data["state"])
                    mask = np.array(data["mask"])
                    advisor_idx = data.get("advisor", -1)
                    
                    # Armazenar transição anterior se existir
                    if last_state is not None:
                        # Recompensa recebida entre o step anterior e este
                        buffer.add(last_state, last_action, data["reward"], state, False, last_mask)
                        current_reward += data["reward"]
                    
                    # Agente escolhe ação
                    action_idx = agent.act(state, mask, advisor_idx)
                    
                    # Enviar ação de volta pro Node.js
                    process.stdin.write(json.dumps({"action": int(action_idx)}) + "\n")
                    process.stdin.flush()
                    
                    last_state = state
                    last_action = action_idx
                    last_mask = mask
                    
                    # Treinar se o buffer tiver dados suficientes
                    if len(buffer) > BATCH_SIZE:
                        agent.learn(buffer.sample())
                        global_step += 1
                        if global_step % TARGET_UPDATE_FREQ == 0:
                            agent.update_target_network()

                elif data["type"] == "game_over":
                    # Armazenar última transição (fim de jogo)
                    if last_state is not None:
                        final_reward = data["reward"]
                        buffer.add(last_state, last_action, final_reward, last_state, True, last_mask)
                        current_reward += final_reward
                    
                    total_games += 1
                    if data["result"] == "WIN":
                        total_wins += 1
                    
                    win_rate = (total_wins / total_games) * 100
                    print(f"🎮 EP {episode:04d} | {data['result']} | Reward: {current_reward:+.2f} | WR: {win_rate:.1f}% | Eps: {agent.epsilon:.3f}")
                    
                    history["wins"].append(1 if data["result"] == "WIN" else 0)
                    history["rewards"].append(current_reward)
                    history["epsilons"].append(agent.epsilon)
                    break

            process.wait()

            # Checkpoint Periódico
            if (episode + 1) % EPISODES_PER_SAVE == 0:
                print(f"💾 Salvando Checkpoint em {DRIVE_PATH}...")
                agent.save(CHECKPOINT_FILE)
                buffer.save(BUFFER_FILE)
                
                metrics = {
                    "episode": episode + 1,
                    "total_wins": total_wins,
                    "total_games": total_games,
                    "history": history
                }
                with open(METRICS_FILE, 'w') as f:
                    json.dump(metrics, f)

    except KeyboardInterrupt:
        print("\n🛑 Treinamento interrompido pelo usuário.")
    except Exception as e:
        print(f"\n❌ Erro durante o treino: {e}")

if __name__ == "__main__":
    run_training()
