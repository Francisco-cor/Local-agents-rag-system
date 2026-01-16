import logging
from typing import Dict, List, Generator
from app.gpu.inference_engine import InferenceEngine
from app.cpu.rag_manager import RAGManager

class AdvancedEngine:
    """
    Handles Advanced Intelligence features:
    1. PoetIQ (Cunningham's Law RAG)
    2. Consensus Engine (Voting)
    """
    def __init__(self, rag_manager: RAGManager, inference_engine: InferenceEngine):
        self.logger = logging.getLogger("AdvancedEngine")
        self.logger.setLevel(logging.INFO)
        self.rag = rag_manager
        self.infer = inference_engine

    def run_poetiq_rag(self, query: str, model_name: str) -> Generator[Dict, None, None]:
        """
        Implementation of PoetIQ (Cunningham's Law):
        "The best way to get the right answer regarding a topic is to post the wrong answer."
        
        Flow:
        1. Query Analysis
        2. Trap Generation (Create a plausible lie/misconception)
        3. Correction Retrieval (Search DB for the correction of the lie)
        4. Final Answer
        """
        # Step 1: Trap Generation
        yield {"step": "poet_trap", "status": "running", "message": "🎣 Generating Cunningham Trap..."}
        
        trap_prompt = (
            f"Topic: {query}\n"
            "Task: Write a single sentence that makes a plausible but FACTUALLY INCORRECT statement about this topic. "
            "It should sound like a common misconception. Do not explain."
        )
        
        trap_statement = self.infer.generate(model_name, trap_prompt, options={"temperature": 0.9, "num_predict": 100})
        yield {"step": "poet_trap", "status": "done", "content": trap_statement}
        
        # Step 2: Correction Retrieval
        # We search the DB for the TRAP. The semantic search should align with the "Correction" or facts effectively.
        yield {"step": "retrieval", "status": "running", "message": f"🔍 Searching context for the trap: '{trap_statement}'..."}
        
        results = self.rag.search(trap_statement, n_results=3)
        context_text = ""
        for res in results:
            context_text += f"---\n{res['text']}\n"
            
        yield {"step": "retrieval", "status": "done", "content": context_text, "sources": [r['metadata'] for r in results]}
        
        # Step 3: Final Resolution
        yield {"step": "synthesizer", "status": "running", "message": "✨ Resolving truth from the lie..."}
        
        poet_prompt = (
            f"User Question: {query}\n"
            f"Common Misconception (Trap): {trap_statement}\n"
            f"Retrieved Facts: {context_text}\n\n"
            "Task: Answer the User Question. You may use the Trap to contrast the truth, "
            "but your primary goal is to provide the correct answer based on the Retrieved Facts."
        )
        
        final_response = self.infer.generate(model_name, poet_prompt, options={"temperature": 0.3})
        yield {"step": "synthesizer", "status": "done", "content": final_response}

    def run_consensus(self, query: str, context: str, models: List[str] = ["gemma-3-4b", "qwen3", "ministral-3b"]) -> Generator[Dict, None, None]:
        """
        Runs multiple small models and aggregates the answer.
        """
        responses = {}
        
        yield {"step": "consensus_init", "status": "running", "message": f"👥 Convening council of {len(models)} models..."}
        
        prompt = f"Question: {query}\nContext: {context}\nAnswer:"
        
        # Sequential execution to save VRAM (Parallel if hardware allows, but we assume local consumer GPU)
        for model in models:
            yield {"step": "model_vote", "status": "running", "message": f"Thinking: {model}..."}
            try:
                res = self.infer.generate(model, prompt, options={"temperature": 0.5})
                responses[model] = res
                yield {"step": "model_vote", "status": "done", "model": model, "content": res}
            except Exception as e:
                self.logger.error(f"Consensus error {model}: {e}")
                
        # Final Aggregation
        yield {"step": "aggregator", "status": "running", "message": "⚖️ Aggregating consensus..."}
        
        # We ask the first model to synthesize the others
        agg_prompt = (
            f"Question: {query}\n\n"
            "Here are proposed answers from different agents:\n"
        )
        for m, r in responses.items():
            agg_prompt += f"[{m}]: {r}\n\n"
            
        agg_prompt += "Task: Synthesize a final, single best answer that incorporates the consensus view."
        
        final = self.infer.generate(models[0], agg_prompt, options={"temperature": 0.2})
        yield {"step": "aggregator", "status": "done", "content": final}

    def run_deep_reasoning_flow(self, query: str, model_name: str) -> Generator[Dict, None, None]:
        """
        PoetIQ v2: Systemic Reasoning Architecture.
        Implements: Decomposition -> Hypothesis -> Critique -> Verification.
        """
        # Step 1: Decomposition
        yield {"step": "decomposition", "status": "running", "message": "🧩 Decomposing complexity..."}
        
        decomp_prompt = (
            f"Question: {query}\n"
            "Task: Break this question down into 3-4 sub-questions or logical steps necessary to answer it accurately. "
            "Do not answer them yet. Output valid text only."
        )
        plan = self.infer.generate(model_name, decomp_prompt, options={"temperature": 0.1})
        yield {"step": "decomposition", "status": "done", "content": plan}
        
        # Step 2: Retrieval for Sub-questions
        # We search context for the original query AND the plan
        yield {"step": "retrieval", "status": "running", "message": "📚 Gathering evidence for plan..."}
        results = self.rag.search(query + "\n" + plan, n_results=5)
        context_text = "\n".join([f"---\n{r['text']}" for r in results])
        yield {"step": "retrieval", "status": "done", "content": context_text, "sources": [r['metadata'] for r in results]}
        
        # Step 3: Hypothesis Generation
        yield {"step": "hypothesis", "status": "running", "message": "💡 Generating initial hypothesis..."}
        hypo_prompt = (
            f"Context: {context_text}\n"
            f"Plan: {plan}\n"
            f"Question: {query}\n"
            "Task: Generate a comprehensive hypothesis answer following the plan. Be detailed."
        )
        hypothesis = self.infer.generate(model_name, hypo_prompt, options={"temperature": 0.7})
        yield {"step": "hypothesis", "status": "done", "content": hypothesis}
        
        # Step 4: Recursive Critique & Refinement (The "Filter")
        yield {"step": "critique", "status": "running", "message": "🛡️ Applying logic filters..."}
        
        critique_prompt = (
            f"Question: {query}\n"
            f"Hypothesis Answer: {hypothesis}\n"
            f"Context: {context_text}\n"
            "Task: Identify logical fallacies, missing evidence, or hallucinations. "
            "If the answer is solid, say 'PASS'. If not, list specific errors."
        )
        critique = self.infer.generate(model_name, critique_prompt, options={"temperature": 0.1})
        
        if "PASS" in critique.upper() and len(critique) < 50:
            # Good to go
            final_answer = hypothesis
            yield {"step": "critique", "status": "done", "content": "Passed verification."}
        else:
            # Needs refinement
            yield {"step": "critique", "status": "done", "content": f"Flaws found: {critique}"}
            yield {"step": "refinement", "status": "running", "message": "💎 Refining answer based on critique..."}
            
            refine_prompt = (
                f"Original Question: {query}\n"
                f"Draft: {hypothesis}\n"
                f"Critique: {critique}\n"
                "Task: Rewrite the answer to address the critique. Ensure strict adherence to context."
            )
            final_answer = self.infer.generate(model_name, refine_prompt, options={"temperature": 0.2})
            yield {"step": "refinement", "status": "done", "content": final_answer}
            
        # Final Output
        yield {"step": "final_output", "status": "done", "content": final_answer}
