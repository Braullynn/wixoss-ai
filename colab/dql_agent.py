import torch
import torch.nn as nn
import torch.optim as optim
import torch.nn.functional as F
import numpy as np
import random
from collections import deque

class QNetwork(nn.Module):
    """
    Rede Neural Deep-Q.
    Calcula o valor Q esperado para cada ação dado um estado.
    """
    def __init__(self, state_size, action_size):
        super(QNetwork, self).__init__()
        self.fc1 = nn.Linear(state_size, 256)
        self.fc2 = nn.Linear(256, 256)
        self.fc3 = nn.Linear(256, 128)
        self.fc4 = nn.Linear(128, action_size)

    def forward(self, state):
        x = F.relu(self.fc1(state))
        x = F.relu(self.fc2(x))
        x = F.relu(self.fc3(x))
        return self.fc4(x)

class DQNAgent:
    """
    Agente Deep-Q Learning com Epsilon-Greedy e Target Network.
    Suporta Guided Exploration (Mentor WHITE_HOPE).
    """
    def __init__(self, state_size, action_size, lr=1e-3, gamma=0.99, 
                 epsilon_start=1.0, epsilon_end=0.05, epsilon_decay=0.995):
        self.state_size = state_size
        self.action_size = action_size
        self.gamma = gamma
        self.epsilon = epsilon_start
        self.epsilon_min = epsilon_end
        self.epsilon_decay = epsilon_decay
        
        # Guided Exploration rate (Decai separadamente ou junto com epsilon)
        self.guide_rate = 0.8
        self.guide_min = 0.05
        self.guide_decay = 0.99

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # Q-Network e Target Network
        self.q_network = QNetwork(state_size, action_size).to(self.device)
        self.target_network = QNetwork(state_size, action_size).to(self.device)
        self.update_target_network()
        
        self.optimizer = optim.Adam(self.q_network.parameters(), lr=lr)
        self.loss_fn = nn.MSELoss()

    def update_target_network(self):
        self.target_network.load_state_dict(self.q_network.state_dict())

    def act(self, state, mask, advisor_idx=None):
        """
        Escolhe uma ação baseada em Epsilon-Greedy e no mentor.
        """
        # 1. Exploração com Epsilon-Greedy
        if np.random.rand() <= self.epsilon:
            # Sub-estratégia: Guided Exploration (Imitation Learning)
            if advisor_idx is not None and advisor_idx != -1 and np.random.rand() <= self.guide_rate:
                return advisor_idx # Segue o mestre
            
            # Exploração pura: Escolhe aleatoriamente uma das ações válidas da máscara
            valid_indices = [i for i, val in enumerate(mask) if val > 0]
            return random.choice(valid_indices)

        # 2. Exploitação: Escolhe a ação com maior Q-value
        state_t = torch.FloatTensor(state).unsqueeze(0).to(self.device)
        self.q_network.eval()
        with torch.no_grad():
            q_values = self.q_network(state_t).cpu().data.numpy()[0]
        self.q_network.train()

        # Aplicar máscara (penalizar ações inválidas com valor muito baixo)
        masked_q = q_values.copy()
        for i, val in enumerate(mask):
            if val == 0:
                masked_q[i] = -1e9
        
        return np.argmax(masked_q)

    def learn(self, experiences):
        """
        Treina a rede com um batch de experiências.
        """
        states, actions, rewards, next_states, dones, masks = experiences

        states_t = torch.FloatTensor(states).to(self.device)
        actions_t = torch.LongTensor(actions).unsqueeze(1).to(self.device)
        rewards_t = torch.FloatTensor(rewards).unsqueeze(1).to(self.device)
        next_states_t = torch.FloatTensor(next_states).to(self.device)
        dones_t = torch.FloatTensor(dones).unsqueeze(1).to(self.device)
        masks_t = torch.FloatTensor(masks).to(self.device)

        # Obter valores Q esperados da target network
        with torch.no_grad():
            # Double DQN ou DQN simples: aqui usaremos DQN simples para estabilidade inicial
            next_q_values = self.target_network(next_states_t)
            # Aplicar máscara no estado futuro também para não valorizar ações inválidas
            next_q_values = next_q_values + (1.0 - masks_t) * -1e9
            max_next_q = next_q_values.max(1)[0].unsqueeze(1)
            target_q = rewards_t + (self.gamma * max_next_q * (1 - dones_t))

        # Obter valores Q atuais
        current_q = self.q_network(states_t).gather(1, actions_t)

        # Calcular perda e otimizar
        loss = self.loss_fn(current_q, target_q)
        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()

        # Decair epsilon e guide_rate
        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay
        if self.guide_rate > self.guide_min:
            self.guide_rate *= self.guide_decay

        return loss.item()

    def save(self, filepath):
        checkpoint = {
            'model_state_dict': self.q_network.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'epsilon': self.epsilon,
            'guide_rate': self.guide_rate
        }
        torch.save(checkpoint, filepath)

    def load(self, filepath):
        if not torch.cuda.is_available():
            checkpoint = torch.load(filepath, map_location=torch.device('cpu'))
        else:
            checkpoint = torch.load(filepath)
            
        self.q_network.load_state_dict(checkpoint['model_state_dict'])
        self.target_network.load_state_dict(checkpoint['model_state_dict'])
        self.optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
        self.epsilon = checkpoint.get('epsilon', self.epsilon)
        self.guide_rate = checkpoint.get('guide_rate', self.guide_rate)
