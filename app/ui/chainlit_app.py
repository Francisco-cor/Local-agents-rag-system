import chainlit as cl
from app.orchestrator.workflow_manager import WorkflowManager

# Initialize Workflow Manager
# Chainlit reloads per session; WorkflowManager is initialized for the current session.
workflow = WorkflowManager()

@cl.set_chat_profiles
async def chat_profile():
    return [
        cl.ChatProfile(
            name="Simple",
            markdown_description="**Chat Simple**: Direct interaction with a single model and local context.",
            icon="https://img.icons8.com/ios-filled/50/ffffff/chat.png",
        ),
        cl.ChatProfile(
            name="Swarm",
            markdown_description="**The Swarm**: Orchestrated multi-agent reasoning using Provocateur, Critic, and Synthesizer agents.",
            icon="https://img.icons8.com/ios-filled/50/000000/bee.png",
        ),
        cl.ChatProfile(
            name="PoetIQ",
            markdown_description="**PoetIQ**: Advanced Refinement Loop for high-accuracy factual responses.",
            icon="https://img.icons8.com/ios-filled/50/ffffff/brain.png",
        ),
    ]

@cl.on_chat_start
async def start():
    # Dynamic Model Identification
    models = workflow.engine.get_available_models()
    default_model = models[0] if models else "gemma-3-4b"

    # Persistent Settings Selector
    await cl.ChatSettings(
        [
            cl.input_widget.Select(
                id="Model",
                label="Active Model",
                values=models,
                initial_value=default_model,
            )
        ]
    ).send()

    current_profile = cl.user_session.get("chat_profile")
    if current_profile == "PoetIQ":
         await cl.Message(content=f"**PoetIQ Layer Active.**\nRefinement loop enabled.\n**Model:** `{default_model}`").send()
    elif current_profile == "Swarm":
        await cl.Message(content=f"**Multi-Agent Swarm Initialized.**\nAgent Ensemble: Provocateur, Critic, Synthesizer.\n**Model:** `{default_model}`").send()
    else:
        await cl.Message(content=f"**Simple Chat Active.**\nDirect model interaction with RAG.\n**Model:** `{default_model}`").send()

@cl.on_settings_update
async def setup_agent(settings):
    model = settings["Model"]
    await cl.Message(content=f"✔️ **Model switched to:** `{model}`").send()
    
@cl.on_message
async def main(message: cl.Message):
    # Retrieve session settings (ALWAYS get latest selection)
    settings = cl.user_session.get("chat_settings")
    model_name = settings["Model"] if settings and "Model" in settings else "gemma-3-4b" 
    
    # Optional: Send a small indicator of which model is processing this specific message
    process_msg = await cl.Message(content=f"⚙️ *Processing with `{model_name}`...*").send()
    
    final_response = ""
    sources = []
    
    # Map internal steps to Chainlit Step objects for UI visualization
    active_steps = {}
    
    # Identify the active chat profile
    chat_profile = cl.user_session.get("chat_profile")
    
    if chat_profile == "PoetIQ":
        iterator = workflow.run_poetiq_flow(message.content, model_name=model_name)
    elif chat_profile == "Swarm":
        iterator = workflow.run_swarm_flow(message.content, model_name=model_name)
    else:
        # Default Simple Chat Flow
        iterator = workflow.run_simple_flow(message.content, model_name=model_name)
    
    async for event in iterator:
        step_type = event["step"]
        status = event["status"]
        
        step_key = step_type 
        
        if status == "running":
            # Initiate process step in UI
            step = cl.Step(name=step_type.capitalize(), type="process")
            step.input = event.get("message", "Processing...")
            await step.send()
            active_steps[step_key] = step
            
        elif status == "done":
            # Finalize process step
            if step_key in active_steps:
                step = active_steps[step_key]
                content = event.get("content", "")
                
                # Retrieval step logic for source extraction
                if step_type == "retrieval":
                    sources = event.get("sources", [])
                    display_text = content[:500] + "..." if len(content) > 500 else content
                    step.output = f"Retrieved Context:\n{display_text}"
                else:
                    step.output = content
                    
                await step.update()
                
                # Capture final response from the synthesizing agent or terminal step
                if step_type in ["synthesizer", "final_output"]:
                    final_response = content
                    if "Error computing" in content:
                        await cl.Message(content=f"❌ **Inference Error**: {content}").send()


    # Transmit final consolidated response
    msg = cl.Message(content=final_response)
    
    # Format and attach source references
    source_elements = []
    for i, source in enumerate(sources):
        source_name = source.get("source", "Unknown Source")
        source_elements.append(
            cl.Text(name=f"Source {i+1}", content=f"Reference: {source_name}", display="inline")
        )
    
    if source_elements:
        msg.elements = source_elements
        
    await msg.send()
    # Clean up the status indicator
    await process_msg.remove()
