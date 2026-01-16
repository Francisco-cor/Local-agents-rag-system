import chainlit as cl
from app.orchestrator.workflow_manager import WorkflowManager

# Initialize Workflow Manager
# Chainlit reloads per session, so we can init here or in on_chat_start
workflow = WorkflowManager()

@cl.set_chat_profiles
async def chat_profile():
    return [
        cl.ChatProfile(
            name="Swarm",
            markdown_description="**The Swarm**: Provocateur, Critic, and Synthesizer agents.",
            icon="🐝",
        ),
        cl.ChatProfile(
            name="PoetIQ",
            markdown_description="**PoetIQ**: Uses Cunningham's Law (Traps) for better retrieval.",
            icon="🎣",
        ),
    ]

@cl.on_chat_start
async def start():
    chat_profile = cl.user_session.get("chat_profile")
    if chat_profile == "PoetIQ":
         await cl.Message(content="**🎣 PoetIQ Active.**\nI will generate conceptual traps to find the truth.").send()
    else:
        await cl.Message(content="**🐝 The Swarm is Awake.**\nTeam: Provocateur, Critic, Synthesizer.").send()
    
@cl.on_message
async def main(message: cl.Message):
    model_name = "gemma-3-4b" 
    
    # We will use Chainlit Steps to show the agents
    # The workflow.run_swarm_flow yields dictionaries with status/content
    
    final_response = ""
    sources = []
    
    # We need to map our simple "step names" to Chainlit Step objects to update them
    active_steps = {}
    
    # Running the generator. Since it's sync, it might block the loop slightly. 
    # ideally we wrap in make_async, but for local prototype direct call is okay-ish or we can use cl.make_async
    
    # NOTE: Chainlit's run_sync can be used if needed, or just iterate directly if acceptable.
    # We will iterate directly for simplicity.
    
    
    # Check Profile
    chat_profile = cl.user_session.get("chat_profile")
    
    if chat_profile == "PoetIQ":
        iterator = workflow.run_poetiq_flow(message.content, model_name=model_name)
    else:
        # Default Swarm
        iterator = workflow.run_swarm_flow(message.content, model_name=model_name)
    
    for event in iterator:
        step_type = event["step"]
        status = event["status"]
        
        # Unique key for this step
        step_key = step_type 
        
        if status == "running":
            # Create a new step
            step = cl.Step(name=step_type.capitalize(), type="process")
            step.input = event.get("message", "Processing...")
            await step.send()
            active_steps[step_key] = step
            
        elif status == "done":
            # Complete the step
            if step_key in active_steps:
                step = active_steps[step_key]
                content = event.get("content", "")
                
                # Special handling for retrieval to save sources
                if step_type == "retrieval":
                    sources = event.get("sources", [])
                    # Truncate for display
                    display_text = content[:500] + "..." if len(content) > 500 else content
                    step.output = f"Retrieved Context:\n{display_text}"
                else:
                    step.output = content
                    
                await step.update()
                
                # If this was the synthesizer, this is our final answer
                if step_type == "synthesizer":
                    final_response = content

    # Send Final Message
    msg = cl.Message(content=final_response)
    
    # Attach sources nicely
    source_elements = []
    for i, source in enumerate(sources):
        source_name = source.get("source", "Unknown")
        source_elements.append(
            cl.Text(name=f"Source {i+1}", content=f"Source: {source_name}", display="inline")
        )
    
    if source_elements:
        msg.elements = source_elements
        
    await msg.send()
