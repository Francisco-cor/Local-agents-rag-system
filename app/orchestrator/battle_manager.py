import json
import os
import math
import logging
from typing import Dict, List, Optional
from app.gpu.inference_engine import InferenceEngine

class BattleManager:
    """
    Manages the 'Arena': 
    1. Tracks Elo ratings for each model.
    2. Records match results.
    3. Persists data to JSON.
    """
    def __init__(self, data_path: str = "./data/elo_ratings.json"):
        self.logger = logging.getLogger("BattleManager")
        self.logger.setLevel(logging.INFO)
        self.data_path = data_path
        self.inference = InferenceEngine()
        self.ratings = self._load_ratings()

    def _save_ratings(self):
        """Save current ratings to JSON."""
        os.makedirs(os.path.dirname(self.data_path), exist_ok=True)
        with open(self.data_path, 'w') as f:
            json.dump(self.ratings, f, indent=2)

    def _load_ratings(self) -> Dict[str, float]:
        """Load ratings from JSON and synchronize with available Ollama models."""
        existing_ratings = {}
        if os.path.exists(self.data_path):
            try:
                with open(self.data_path, 'r') as f:
                    existing_ratings = json.load(f)
            except Exception as e:
                self.logger.error(f"Error loading ratings: {e}")

        # Get current models from Ollama
        available_models = self.inference.get_available_models()
        self.logger.info(f"Synchronizing leaderboard with {len(available_models)} Ollama models.")

        # Sync: Only keep models that are currently available in Ollama
        synced_ratings = {}
        updated = False
        
        for model in available_models:
            if model in existing_ratings:
                synced_ratings[model] = existing_ratings[model]
            else:
                synced_ratings[model] = 1000.0
                updated = True
        
        # Check if any old models were removed
        if len(synced_ratings) != len(existing_ratings):
            updated = True

        if updated or not os.path.exists(self.data_path):
            self.ratings = synced_ratings
            self._save_ratings()
            
        return synced_ratings

    def get_leaderboard(self) -> List[Dict]:
        """Return sorted leaderboard."""
        sorted_ratings = sorted(self.ratings.items(), key=lambda x: x[1], reverse=True)
        return [{"rank": i+1, "model": k, "elo": round(v, 1)} for i, (k, v) in enumerate(sorted_ratings)]

    def record_match(self, model_a: str, model_b: str, outcome: str):
        """
        Update Elo ratings based on match outcome.
        outcome: "A" (A wins), "B" (B wins), "tie"
        """
        k_factor = 32
        ra = self.ratings.get(model_a, 1000.0)
        rb = self.ratings.get(model_b, 1000.0)

        # Expected scores
        ea = 1 / (1 + 10 ** ((rb - ra) / 400))
        eb = 1 / (1 + 10 ** ((ra - rb) / 400))

        # Actual scores
        if outcome == "A":
            sa, sb = 1, 0
        elif outcome == "B":
            sa, sb = 0, 1
        else: # Tie
            sa, sb = 0.5, 0.5

        # Update
        new_ra = ra + k_factor * (sa - ea)
        new_rb = rb + k_factor * (sb - eb)

        self.ratings[model_a] = new_ra
        self.ratings[model_b] = new_rb
        
        self.logger.info(f"Match Recorded: {model_a} vs {model_b} | Outcome: {outcome} | New Elo: {model_a}={new_ra:.1f}, {model_b}={new_rb:.1f}")
        self._save_ratings()
        
        return self.get_leaderboard()
