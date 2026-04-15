# 💻 Instruções para Treinamento Local

Siga estes passos para executar o treinamento da IA do Wixoss diretamente em sua máquina (Windows/Linux/Mac), utilizando sua GPU ou CPU local.

## 1. Pré-requisitos

### Python
Certifique-se de ter o Python 3.8 ou superior instalado. Você pode baixar em [python.org](https://www.python.org/).

### Node.js
O motor do jogo roda em Node.js. Certifique-se de ter a versão 18.x ou superior instalada.

### Dependências da IA
Instale as bibliotecas necessárias via terminal (PowerShell ou CMD):

```bash
pip install torch numpy
```

### Dependências do Motor (Node.js)
Na pasta raiz do `webxoss-core`, instale as dependências:

```bash
cd webxoss-core
npm install
```

---

## 2. Como Executar

1. Abra o terminal na pasta do submódulo de treinamento:
   ```bash
   cd webxoss-core/ml-training
   ```

2. Execute o script de treinamento:
   ```bash
   python colab/wixoss_dql_training.py
   ```

   Por padrão, os resultados serão salvos em `./training_results/`.

### Opções Disponíveis (argparse)

```bash
# Alterar pasta de saída
python colab/wixoss_dql_training.py --output ./meus_resultados

# Treinar um número específico de episódios
python colab/wixoss_dql_training.py --episodes 5000

# Usar batch size maior (requer mais RAM/VRAM)
python colab/wixoss_dql_training.py --batch_size 128
```

### O que esperar:
- O terminal começará a mostrar o log das partidas:
  `FINALIZADO EP 0001 (1/100000) | WIN | Time: 2.3s | Reward: +1.45 | WR: 100.0%`
- A cada 10 episódios, um arquivo de checkpoint (`checkpoint.pt`) será salvo.
- Se você fechar o terminal e abrir novamente, o treino continuará automaticamente de onde parou.

---

## 3. Dicas de Performance

- **GPU**: Se você tiver uma placa de vídeo NVIDIA, o PyTorch tentará usá-la automaticamente se os drivers CUDA estiverem instalados.
- **Aceleração**: O treino local é geralmente mais rápido que no Colab Free, pois não há latência de rede para salvar os checkpoints.
- **Teste Rápido**: Para testar apenas se a integração Node.js está funcionando sem rodar o treino completo:
  ```bash
  node headless/HeadlessRunner.js --test
  ```
