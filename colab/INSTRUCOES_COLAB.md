# 🚀 Wixoss Deep-Q Learning: Google Colab Setup

Siga estas instruções para iniciar o treinamento da sua I.A no Google Colab.

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

# 3. Clonar repositório e submódulos
!git clone --recursive https://github.com/Braullynn/webxoss-core.git /content/webxoss-core
%cd /content/webxoss-core
!git checkout feature
!git submodule update --init --recursive
```

### Passo 2: Iniciar Treinamento (Célula 2)
Este comando inicia o script mestre que coordena o Node.js e o PyTorch.

```python
%cd /content/webxoss-core/ml-training/colab
!python wixoss_dql_training.py
```

---

### ℹ️ Informações Úteis

1. **Checkpoints**: O progresso é salvo automaticamente na pasta `Meu Drive/wixoss-dql/` a cada 10 partidas.
2. **Auto-Resume**: Se a conexão do Colab cair, basta rodar os passos acima novamente. O script detectará os arquivos no Drive e continuará de onde parou.
3. **Métricas**: Você verá o log no console com:
   - `EP`: Número da partida
   - `Result`: Venceu (WIN) ou Perdeu (LOSE)
   - `Reward`: Pontuação de desempenho
   - `WR`: Win Rate (Taxa de vitória acumulada)
   - `Eps`: Nível de exploração da IA (diminui com o tempo)

### ⚠️ Importante
Mantenha a aba do Colab aberta. Se o tempo de inatividade expirar, o treino será pausado (mas o checkpoint garantirá que você não perca os dados).
