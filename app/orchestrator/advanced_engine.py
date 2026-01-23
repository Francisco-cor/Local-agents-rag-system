import logging
from typing import Dict, List, Generator, AsyncGenerator
from app.gpu.inference_engine import InferenceEngine
from app.cpu.rag_manager import RAGManager

class AdvancedEngine:
    """
    Handles Advanced Intelligence features (Asynchronous):
    1. PoetIQ (Cunningham's Law RAG)
    2. Consensus Engine (Voting)
    """
    def __init__(self, rag_manager: RAGManager, inference_engine: InferenceEngine):
        self.logger = logging.getLogger("AdvancedEngine")
        self.logger.setLevel(logging.INFO)
        self.rag = rag_manager
        self.infer = inference_engine

    async def run_poetiq_rag(self, query: str, model_name: str) -> AsyncGenerator[Dict, None]:
        """
        Refined PoetIQ (Systemic Reasoning Flow):
        1. Retrieval
        2. Initial Hypothesis
        3. Critique
        4. Final Refinement
        """
        # Step 1: Retrieval
        yield {"step": "retrieval", "status": "running", "message": "🔍 Searching knowledge base..."}
        results = self.rag.search(query, n_results=5)
        context_text = "\n".join([f"---\n{r['text']}" for r in results])
        yield {"step": "retrieval", "status": "done", "content": context_text, "sources": [r['metadata'] for r in results]}

        # Step 2: Initial Hypothesis
        yield {"step": "hypothesis", "status": "running", "message": "💡 Generating initial best response..."}
        hypo_prompt = (
            f"Context:\n{context_text}\n\n"
            f"Question: {query}\n"
            "Task: Provide a detailed and accurate answer based strictly on the context."
        )
        hypothesis = await self.infer.async_generate(model_name, hypo_prompt, options={"temperature": 0.3})
        yield {"step": "hypothesis", "status": "done", "content": hypothesis}

        # Step 3: Critique
        yield {"step": "critique", "status": "running", "message": "🛡️ Auditing for mistakes or missing info..."}
        critique_prompt = (
            f"Question: {query}\n"
            f"Draft Answer: {hypothesis}\n"
            f"Reference Context: {context_text}\n"
            "Task: Identify any factual errors, omissions, or logical inconsistencies. "
            "If the answer is perfect, say 'PASS'. Otherwise, list improvements."
        )
        critique = await self.infer.async_generate(model_name, critique_prompt, options={"temperature": 0.1})
        yield {"step": "critique", "status": "done", "content": critique}

        # Step 4: Final Refinement
        if "PASS" in critique.upper() and len(critique) < 50:
            yield {"step": "final_output", "status": "done", "content": hypothesis}
        else:
            yield {"step": "refinement", "status": "running", "message": "💎 Polishing final answer..."}
            refine_prompt = (
                f"Question: {query}\n"
                f"Draft: {hypothesis}\n"
                f"Critique: {critique}\n"
                "Task: Rewrite the answer to be perfect, addressing all critique points."
            )
            final_answer = await self.infer.async_generate(model_name, refine_prompt, options={"temperature": 0.2})
            yield {"step": "refinement", "status": "done", "content": final_answer}
            yield {"step": "final_output", "status": "done", "content": final_answer}

    async def run_consensus(self, query: str, context: str, models: List[str] = ["gemma-3-4b", "qwen3", "ministral-3b"]) -> AsyncGenerator[Dict, None]:
        """
        Runs multiple small models and aggregates the answer (Asynchronous).
        """
        responses = {}
        
        yield {"step": "consensus_init", "status": "running", "message": f"👥 Convening council of {len(models)} models..."}
        
        prompt = f"Question: {query}\nContext: {context}\nAnswer:"
        
        for model in models:
            yield {"step": "model_vote", "status": "running", "message": f"Thinking: {model}..."}
            try:
                res = await self.infer.async_generate(model, prompt, options={"temperature": 0.5})
                responses[model] = res
                yield {"step": "model_vote", "status": "done", "model": model, "content": res}
            except Exception as e:
                self.logger.error(f"Consensus error {model}: {e}")
                
        # Final Aggregation
        yield {"step": "aggregator", "status": "running", "message": "⚖️ Aggregating consensus..."}
        
        agg_prompt = (
            f"Question: {query}\n\n"
            "Here are proposed answers from different agents:\n"
        )
        for m, r in responses.items():
            agg_prompt += f"[{m}]: {r}\n\n"
            
        agg_prompt += "Task: Synthesize a final, single best answer that incorporates the consensus view."
        
        final = await self.infer.async_generate(models[0], agg_prompt, options={"temperature": 0.2})
        yield {"step": "aggregator", "status": "done", "content": final}

    async def run_deep_reasoning_flow(self, query: str, model_name: str) -> AsyncGenerator[Dict, None]:
        """
        PoetIQ v2: Systemic Reasoning Architecture (Asynchronous).
        """
        # Step 1: Decomposition
        yield {"step": "decomposition", "status": "running", "message": "🧩 Decomposing complexity..."}
        
        decomp_prompt = (
            f"Question: {query}\n"
            "Task: Break this question down into 3-4 sub-questions or logical steps necessary to answer it accurately. "
            "Do not answer them yet. Output valid text only."
        )
        plan = await self.infer.async_generate(model_name, decomp_prompt, options={"temperature": 0.1})
        yield {"step": "decomposition", "status": "done", "content": plan}
        
        # Step 2: Retrieval for Sub-questions
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
        hypothesis = await self.infer.async_generate(model_name, hypo_prompt, options={"temperature": 0.7})
        yield {"step": "hypothesis", "status": "done", "content": hypothesis}
        
        # Step 4: Recursive Critique & Refinement
        yield {"step": "critique", "status": "running", "message": "🛡️ Applying logic filters..."}
        
        critique_prompt = (
            f"Question: {query}\n"
            f"Hypothesis Answer: {hypothesis}\n"
            f"Context: {context_text}\n"
            "Task: Identify logical fallacies, missing evidence, or hallucinations. "
            "If the answer is solid, say 'PASS'. If not, list specific errors."
        )
        critique = await self.infer.async_generate(model_name, critique_prompt, options={"temperature": 0.1})
        
        if "PASS" in critique.upper() and len(critique) < 50:
            final_answer = hypothesis
            yield {"step": "critique", "status": "done", "content": "Passed verification."}
        else:
            yield {"step": "critique", "status": "done", "content": f"Flaws found: {critique}"}
            yield {"step": "refinement", "status": "running", "message": "💎 Refining answer based on critique..."}
            
            refine_prompt = (
                f"Original Question: {query}\n"
                f"Draft: {hypothesis}\n"
                f"Critique: {critique}\n"
                "Task: Rewrite the answer to address the critique. Ensure strict adherence to context."
            )
            final_answer = await self.infer.async_generate(model_name, refine_prompt, options={"temperature": 0.2})
            yield {"step": "refinement", "status": "done", "content": final_answer}
            
        # Final Output
        yield {"step": "final_output", "status": "done", "content": final_answer}
