import numpy as np
import random
from collections import deque
import pickle
import os

class ReplayBuffer:
    """
    Buffer para armazenar e amostrar experiências de treino (S, A, R, S', Done, Mask).
    """
    def __init__(self, action_size, buffer_size=50000, batch_size=64):
        self.action_size = action_size
        self.memory = deque(maxlen=buffer_size)
        self.batch_size = batch_size

    def add(self, state, action, reward, next_state, done, mask):
        """Adiciona uma nova experiência à memória."""
        e = (state, action, reward, next_state, done, mask)
        self.memory.append(e)

    def sample(self):
        """Amostra aleatoriamente um batch de experiências da memória."""
        experiences = random.sample(self.memory, k=self.batch_size)

        states = np.vstack([e[0] for e in experiences if e is not None])
        actions = np.array([e[1] for e in experiences if e is not None])
        rewards = np.array([e[2] for e in experiences if e is not None])
        next_states = np.vstack([e[3] for e in experiences if e is not None])
        dones = np.array([e[4] for e in experiences if e is not None]).astype(np.uint8)
        masks = np.vstack([e[5] for e in experiences if e is not None])

        return (states, actions, rewards, next_states, dones, masks)

    def __len__(self):
        """Retorna o tamanho atual da memória."""
        return len(self.memory)

    def save(self, filepath):
        """Salva a memória em um arquivo (pickle)."""
        with open(filepath, 'wb') as f:
            pickle.dump(list(self.memory), f)

    def load(self, filepath):
        """Carrega a memória de um arquivo."""
        if os.path.exists(filepath):
            with open(filepath, 'rb') as f:
                self.memory = deque(pickle.load(f), maxlen=self.memory.maxlen)
            return True
        return False
