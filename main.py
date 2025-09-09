import uuid, torch, os
from typing import Dict, Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
import uvicorn

# ------------------  CONFIG  ------------------
MODEL_ID = "mistralai/Mistral-7B-Instruct-v0.2"
DEVICE   = "cuda" if torch.cuda.is_available() else "cpu"
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", 512))
TEMPERATURE    = float(os.getenv("TEMPERATURE", 0.7))

# 4-bit quantization → fits in 6 GB VRAM (Render GPU plan)
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_use_double_quant=True,
    bnb_4bit_quant_type="nf4"
)

print("🌀 Loading tokenizer + model …")
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, use_fast=True)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID,
    quantization_config=bnb_config if DEVICE=="cuda" else None,
    device_map="auto",
    torch_dtype=torch.float16,
    low_cpu_mem_usage=True
)
tokenizer.pad_token = tokenizer.eos_token
print("✅ Model ready on", DEVICE.upper())

# ------------------  FASTAPI  ------------------
app = FastAPI(title="CYBIX XR1 Real-AI API", version="1.0.0")

class PromptIn(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4_000)

class AIOut(BaseModel):
    id: str
    prompt: str
    response: str
    tokens_used: int
    status: str = "success"

def build_prompt(user: str) -> str:
    # Mistral-Instruct format
    return f"<s>[INST] {user.strip()} [/INST]"

@app.post("/api/ai", response_model=AIOut)
async def ai_endpoint(body: PromptIn) -> Dict[str, Any]:
    try:
        prompt = build_prompt(body.prompt)
        inputs = tokenizer(prompt, return_tensors="pt").to(DEVICE)
        with torch.no_grad():
            out = model.generate(
                **inputs,
                max_new_tokens=MAX_NEW_TOKENS,
                temperature=TEMPERATURE,
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id
            )
        response = tokenizer.decode(out[0], skip_special_tokens=True)
        response = response.split("[/INST]")[-1].strip()
        return {
            "id": str(uuid.uuid4()),
            "prompt": body.prompt,
            "response": response,
            "tokens_used": out.shape[1] - inputs.input_ids.shape[1],
        }
    except Exception as e:
        raise HTTPException(500, detail=f"AI error: {str(e)}")

@app.get("/")
async def root():
    return {"message": "CYBIX XR1 Real-AI API is live", "docs": "/docs"}
