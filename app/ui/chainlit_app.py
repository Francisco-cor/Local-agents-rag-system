import chainlit as cl
from app.orchestrator.workflow_manager import WorkflowManager

# Initialize Workflow Manager
# Chainlit reloads per session, so we can init here or in on_chat_start
workflow = WorkflowManager()

@cl.on_chat_start
async def start():
    await cl.Message(content="**🐝 Welcome to the Swarm.**\nI am ready to process your documents and queries.").send()
    
@cl.on_message
async def main(message: cl.Message):
    # Retrieve settings (Simulated for now)
    model_name = "gemma-3-4b" 
    
    # 1. Processing / Thinking Message
    msg = cl.Message(content="")
    await msg.send()
    
    # 2. Retrieval Step (Visible thought)
    async with cl.Step(name="Retrieval", type="tool") as step:
        step.input = message.content
        results = workflow.rag.search(message.content)
        context_str = "\n".join([f"- {r['text'][:100]}..." for r in results])
        step.output = f"Found {len(results)} relevant chunks:\n{context_str}"
    
    # 3. Generation Step
    # We'll stream the response from Ollama
    # Note: WorkflowManager currently does sync generation. 
    # For Phase 1 we will just use the sync wrapper inside an async loop.
    
    response_dict = workflow.process_query(message.content, model_name=model_name)
    response_text = response_dict["response"]
    
    # Stream back the final answer
    msg.content = response_text
    await msg.update()
    
    # Attach sources
    source_elements = []
    for i, source in enumerate(response_dict["sources"]):
        source_name = source.get("source", "Unknown")
        text_content = response_dict["context_used"] # Ideally we slice the specific part
        source_elements.append(
            cl.Text(name=f"Source {i+1}", content=f"Source: {source_name}", display="inline")
        )
    
    if source_elements:
        msg.elements = source_elements
        await msg.update()
