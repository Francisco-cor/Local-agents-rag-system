export interface HardwareInfo {
  total_ram_gb: number;
  available_ram_gb: number;
  cpu_cores: number;
  cpu_name: string;
  gpu_vram_mb: number;
  gpu_name: string;
}

export interface ModelOptions {
  num_ctx: number | null;
  num_gpu: number | null;
  num_thread: number | null;
}

export interface ModelCapabilities {
  num_layers: number;
  max_context: number;
  architecture: string;
  parameter_size: string;
  quantization: string;
  size_gb: number;
}

export interface WorkflowStep {
  step: string;
  status: string;
  message: string | null;
  content: string | null;
  model: string | null;
  chunk: string | null;
}

export interface ModelRating {
  model: string;
  elo: number;
}

export interface ArenaBattle {
  id: number;
  prompt: string;
  model_a: string;
  model_b: string;
  model_c?: string | null;
  response_a: string;
  response_b: string;
  response_c?: string | null;
  winner: string | null;
  timestamp: string;
}
