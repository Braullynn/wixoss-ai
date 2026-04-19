# 🚀 Wixoss Deep-Q Learning: Google Colab Setup

Siga estas instruções para iniciar o treinamento da sua I.A no Google Colab.

> ⚠️ **Requisito**: Use um runtime com GPU para performance. Vá em `Runtime > Change runtime type > T4 GPU`.

---

### Passo 1: Configuração do Ambiente (Célula 1)
Cole e execute este código para montar o Drive e instalar as dependências.

```python
# 1. Montar Google Drive para salvar o progresso
from google.colab import drive
drive.mount('/content/drive')

# 2. Instalar Node.js 18.x
!curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
!sudo apt-get install -y nodejs
print("\n✅ Node.js instalado:")
!node -v

# 3. Verificar GPU (PyTorch já vem pré-instalado no Colab)
import torch
print(f"✅ PyTorch: {torch.__version__}")
print(f"✅ CUDA disponível: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"   GPU: {torch.cuda.get_device_name(0)}")
else:
    print("   ⚠️ Treinando na CPU (mais lento, mas funciona)")

# 4. Clonar repositório e submódulos
!git clone --recursive https://github.com/Braullynn/webxoss-core.git /content/webxoss-core
%cd /content/webxoss-core
!git checkout feature
!git submodule update --init --recursive

# 5. Instalar dependências Node.js (random-js é obrigatório para o motor do jogo)
!npm install

# 6. Criar pasta de checkpoints no Drive
import os
os.makedirs('/content/drive/MyDrive/wixoss-dql', exist_ok=True)
print("\n✅ Ambiente configurado com sucesso!")
```

### Passo 2: Iniciar Treinamento (Célula 2)
Este comando inicia o script mestre que coordena o Node.js e o PyTorch.

> **IMPORTANTE**: O script deve ser executado a partir da pasta `ml-training/` (não `ml-training/colab/`).

```python
%cd /content/webxoss-core/ml-training
!python colab/wixoss_dql_training.py --output /content/drive/MyDrive/wixoss-dql --episodes 10000
```

### Passo 3 (Opcional): Retomar Treinamento Após Desconexão
Se a sessão do Colab expirar, basta reabrir e executar **ambas as células** novamente.
O script detecta automaticamente os checkpoints no Drive e continua de onde parou.

```python
# Célula 1: Re-montar ambiente (executar Passo 1 novamente)

# Célula 2: Retomar treino (mesmo comando do Passo 2)
%cd /content/webxoss-core/ml-training
!python colab/wixoss_dql_training.py --output /content/drive/MyDrive/wixoss-dql --episodes 50000
```

---

### ℹ️ Informações Úteis

1. **Checkpoints**: O progresso é salvo automaticamente na pasta `Meu Drive/wixoss-dql/` a cada 10 partidas.
   - `checkpoint.pt` — Pesos do modelo neural
   - `replay_buffer.pkl` — Memória de experiências
   - `metrics.json` — Histórico de vitórias, recompensas e epsilon
2. **Auto-Resume**: Se a conexão do Colab cair, basta rodar os passos acima novamente. O script detectará os arquivos no Drive e continuará de onde parou.
3. **Métricas**: Você verá o log no console com:
   - `EP`: Número da partida
   - `Result`: Venceu (WIN) ou Perdeu (LOSE)
   - `Reward`: Pontuação de desempenho
   - `WR`: Win Rate (Taxa de vitória acumulada)
   - `Eps`: Nível de exploração da IA (diminui com o tempo)

### 🔧 Opções Avançadas

```python
# Treinar com batch maior (usa mais VRAM, mas aprende mais rápido)
!python colab/wixoss_dql_training.py --output /content/drive/MyDrive/wixoss-dql --batch_size 128

# Treinar mais ou menos episódios
!python colab/wixoss_dql_training.py --output /content/drive/MyDrive/wixoss-dql --episodes 50000
```

### 🧪 Teste Rápido (Verificar se o motor funciona)
Se quiser apenas testar se o ambiente Node.js está funcionando sem iniciar o treino:

```python
%cd /content/webxoss-core/ml-training
!node headless/HeadlessRunner.js --test
```

### ⚠️ Importante
- Mantenha a aba do Colab aberta. Se o tempo de inatividade expirar, o treino será pausado (mas o checkpoint garantirá que você não perca os dados).
- O runtime **gratuito** do Colab tem limite de ~12 horas. Para treinos longos, considere o Colab Pro.
- Se der erro `Cannot find module 'random-js'`, significa que o `npm install` não foi executado. Rode o Passo 1 novamente.
