use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct ModelRating {
    pub model: String,
    pub elo: f64,
}

pub struct BattleManager {
    data_path: PathBuf,
    ratings: HashMap<String, f64>,
}

impl BattleManager {
    pub fn new(data_dir: PathBuf) -> Self {
        let data_path = data_dir.join("elo_ratings.json");
        let mut manager = Self {
            data_path,
            ratings: HashMap::new(),
        };
        manager.load_ratings();
        manager
    }

    fn load_ratings(&mut self) {
        if self.data_path.exists() {
            if let Ok(content) = fs::read_to_string(&self.data_path) {
                if let Ok(ratings) = serde_json::from_str::<HashMap<String, f64>>(&content) {
                    self.ratings = ratings;
                }
            }
        }
    }

    fn save_ratings(&self) {
        if let Some(parent) = self.data_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&self.data_path, serde_json::to_string_pretty(&self.ratings).unwrap_or_default());
    }

    pub fn get_leaderboard(&self) -> Vec<ModelRating> {
        let mut leaderboard: Vec<ModelRating> = self.ratings.iter()
            .map(|(k, v)| ModelRating { model: k.clone(), elo: *v })
            .collect();
        
        leaderboard.sort_by(|a, b| b.elo.total_cmp(&a.elo));
        leaderboard
    }

    pub fn record_match(&mut self, model_a: String, model_b: String, outcome: &str) -> Vec<ModelRating> {
        let k_factor = 32.0;
        let ra = *self.ratings.get(&model_a).unwrap_or(&1000.0);
        let rb = *self.ratings.get(&model_b).unwrap_or(&1000.0);

        let ea = 1.0 / (1.0 + 10.0f64.powf((rb - ra) / 400.0));
        let eb = 1.0 / (1.0 + 10.0f64.powf((ra - rb) / 400.0));

        let (sa, sb) = match outcome {
            "A" => (1.0, 0.0),
            "B" => (0.0, 1.0),
            _ => (0.5, 0.5),
        };

        self.ratings.insert(model_a, ra + k_factor * (sa - ea));
        self.ratings.insert(model_b, rb + k_factor * (sb - eb));
        
        self.save_ratings();
        self.get_leaderboard()
    }
}
