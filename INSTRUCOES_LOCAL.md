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

---

## 2. Configuração de Pastas

O script de treinamento está configurado por padrão para salvar no caminho do Google Colab (`/content/drive/...`). 

Para rodar localmente, abra o arquivo `colab/wixoss_dql_training.py` e altere a linha 11:

**De:**
```python
DRIVE_PATH = "/content/drive/MyDrive/wixoss-dql"
```

**Para (exemplo de pasta local):**
```python
DRIVE_PATH = "./training_results"
```

---

## 3. Como Executar

1. Abra o terminal na pasta raiz do projeto de treinamento:
   ```bash
   cd webxoss-core/ml-training
   ```

2. Execute o script de treinamento:
   ```bash
   python colab/wixoss_dql_training.py
   ```

### O que esperar:
- O terminal começará a mostrar o log das partidas:
  `🎮 EP 0001 | WIN | Reward: +1.45 | WR: 100.0% | Eps: 0.995`
- A cada 10 episódios, um arquivo de checkpoint (`checkpoint.pt`) será salvo na pasta definida em `DRIVE_PATH`.
- Se você fechar o terminal e abrir novamente, o treino continuará automaticamente de onde parou.

---

## 4. Dicas de Performance

- **GPU**: Se você tiver uma placa de vídeo NVIDIA, o PyTorch tentará usá-la automaticamente se os drivers CUDA estiverem instalados.
- **Aceleração**: O treino local é geralmente mais rápido que no Colab Free, pois não há latência de rede para salvar os checkpoints.
- **Teste Rápido**: Para testar apenas se a integração está funcionando sem rodar o treino completo, você pode usar:
  ```bash
  node headless/HeadlessRunner.js --test
  ```
