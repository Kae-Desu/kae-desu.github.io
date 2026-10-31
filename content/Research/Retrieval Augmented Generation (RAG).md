---
title: Retrieval Augmented Generation
date: 2026-10-27
tags:
  - "#llm"
  - ai
  - rag
---
Retrieval-Augmented Generation (RAG), a technique to enable Language Models to interact with any data outside the cutoff date, real time data, company specific data. Yeah, basically anything that can and cannot be found outside the data burn in the model weight in this case their semantic knowledge (world knowledge). by giving it something that resembles a "wiki book".

So.. what RAG actual "actually" is? to put it very short RAG is just a bunch of array of numbers or coordinates. the process of converting a text (or a chunk of text if its too long) to an array of numbers (coordinates) is called 'embedding', this so-called coordinates are then stored into a special kind of database which is called 'vector database' this is different from the normal mysql or postgres. Instead of using queries like `SELECT * FROM dbname;` vector database are searched and queried based on similarity (more on this later).

before looking at visualisation of embedding and similarity search, first take a look at 'embedding model' this differ from language model which is used mainly for the logic and reasoning, embedding model only takes a text (or a chunk of text) and turns it into a coordinates, like 2d or 3d coordinate. but its not 2d or 3d coordinates, its hundreds of coordinates. why? because each vector usually resembles something which is defined or not during the training the model sometimes find a pattern and add a new vector which sometimes results in a very weird dimension numbers. example of models.

| Embedding Model      | Dimension |
| -------------------- | --------- |
| bge base en v1.5 f16 | 768       |
| Qwen3 embedding 8B   | 4096      |
| embedding gemma 300m | 768       |

To visualise this, use the dataset of cat facts from [https://huggingface.co/ngxson/demo_simple_rag_py/blob/main/cat-facts.txt](https://huggingface.co/ngxson/demo_simple_rag_py/blob/main/cat-facts.txt?ref=nutelyn.com) and any embedding model (each model will have different results).

```python
from llama_cpp import Llama

print("Loading embedding model...")
embedder = Llama(
    model_path="./bge-base-en-v1.5-f16.gguf",
    embedding=True, 
    verbose=False
)

print("\nModel loaded successfully! Type your text below.")
print("Type 'exit' or 'quit' to stop the script.\n")

while True:
    user_text = input("> ")
    
    if user_text.strip().lower() in ['exit', 'quit']:
        print("Exiting...")
        break
        
    if not user_text.strip():
        continue

    try:
        response = embedder.create_embedding(user_text)
        embedding = response['data'][0]['embedding']
        
        print(f"\n[Success] Generated vector for: '{user_text}'")
        print(f"Dimensions: {len(embedding)}")
        print(f"First 5 values: {embedding[:5]}\n")
        
    except Exception as e:
        print(f"An error occurred: {e}\n")
```

Running the python script above will return first 5 elements of the array from the whole 768 dimension.

```bash
> hello, i'm nutelyn 

[Success] Generated vector for: 'hello, i'm nutelyn'
Dimensions: 768
First 5 values: [-0.2574899196624756, -0.09942889213562012, 0.6457444429397583, -0.5455319881439209, -0.2931940257549286]

> nice to meet you

[Success] Generated vector for: 'nice to meet you'
Dimensions: 768
First 5 values: [0.20588743686676025, -0.2820778489112854, 0.41451603174209595, 0.1704966425895691, 0.04075852036476135]
```

Okay, now that the form of the coordinates is shown if it is visualised it will be like a massive space with 768 vector and these sentences will be somewhere in those coordinate. As previously discussed, RAG are queried by "similarity" but how does it calculated? apparently people out there using a formula called "cosine similarity" this works by calculating the angle between two point, and the closer they are (nearing 1.0) signaling relevances or confidentiality. Cosine similarity formula are written as below.

![[cosine similarity formula.png]]

The product of this calculation ranging from -1 to 1 where 1 means the text is virtually identical, 0 means the text has nothing to do with each other and -1 means its opposing each other. Usually RAG will have a similarity threshold of 0.70 it can be higher or lower according to the use case.

Take a look at this python code, this code below is a simple chatbot that includes the cat facts RAG which is loaded to a vector database and utilising cosine similarity to add context when asked about cat into the Small Language Model.

```python
from llama_cpp import Llama

# ==========================================
# 1. INITIALIZE LOCAL MODELS (GGUF)
# ==========================================
print("Loading embedding model...")
embedder = Llama(
    model_path="./bge-base-en-v1.5-f16.gguf",
    embedding=True, 
    verbose=False
)

print("Loading generative language model...")
llm = Llama(
    model_path="./qwen2.5_0.5b.gguf",
    n_ctx=2048,
    verbose=False
)

# ==========================================
# 2. SEED THE VECTOR DATABASE
# ==========================================
dataset = []

with open('cat-facts.txt', 'r') as file:
    dataset = file.readlines()
print(f"Loaded {len(dataset)} lines from cat-facts.txt")

VECTOR_DB = []

def add_chunk_to_database(chunk):
    response = embedder.create_embedding(chunk)
    embedding = response['data'][0]['embedding']
    VECTOR_DB.append((chunk, embedding))

print("Embedding dataset into memory...")
for i, chunk in enumerate(dataset):
    add_chunk_to_database(chunk)

# ==========================================
# 3. MATHEMATICAL SEARCH UTILITIES
# ==========================================
def cosine_similarity(a, b):
    dot_product = sum([x * y for x, y in zip(a, b)])
    norm_a = sum([x ** 2 for x in a]) ** 0.5
    norm_b = sum([x ** 2 for x in b]) ** 0.5
    if not norm_a or not norm_b:
        return 0.0
    return dot_product / (norm_a * norm_b)

def retrieve(query, top_n=2):
    query_embedding = embedder.create_embedding(query)['data'][0]['embedding']
    similarities = []
    for chunk, embedding in VECTOR_DB:
        similarity = cosine_similarity(query_embedding, embedding)
        similarities.append((chunk, similarity))
    similarities.sort(key=lambda x: x[1], reverse=True)
    return similarities[:top_n]

# ==========================================
# 4. EXECUTE RUNTIME PIPELINE
# ==========================================
input_query = input('\nAsk me a question about cats: ')
retrieved_knowledge = retrieve(input_query)

print('\n--- Retrieved Knowledge ---')
for chunk, similarity in retrieved_knowledge:
    print(f' - (similarity: {similarity:.2f}) {chunk.strip()}')

# Construct the exact instruction prompt template
context_text = '\n'.join([f' - {chunk.strip()}' for chunk, similarity in retrieved_knowledge])
instruction_prompt = f"""You are a helpful chatbot.
Use only the following pieces of context to answer the question. Don't make up any new information.

Context:
{context_text}

Question: {input_query}
Answer:"""

print('\n--- Chatbot Response ---')

# Execute local generation stream using llama-cpp-python instead of ollama
response_stream = llm(
    prompt=instruction_prompt,
    max_tokens=256,
    stream=True
)

for chunk in response_stream:
    text_token = chunk['choices'][0]['text']
    print(text_token, end='', flush=True)
print("\n")
```

```bash
Loading embedding model...
Loading generative language model...
llama_context: n_ctx_seq (2048) < n_ctx_train (32768) -- the full capacity of the model will not be utilized
Loaded 150 lines from cat-facts.txt
Embedding dataset into memory...

Ask me a question about cats: why or how does cat purrs?

--- Retrieved Knowledge ---
 - (similarity: 0.83) Researchers are unsure exactly how a cat purrs. Most veterinarians believe that a cat purrs by vibrating vocal folds deep in the throat. To do this, a muscle in the larynx opens and closes the air passage about 25 times per second.
 - (similarity: 0.72) A cat almost never meows at another cat, mostly just humans. Cats typically will spit, purr, and hiss at other cats.

--- Chatbot Response ---
 Because a cat purrs by vibrating vocal folds deep in the throat to do this, a muscle in the larynx opens and closes the air passage about 25 times per second.
```

When asked "why or how does cat purrs?" the query goes through the RAG first to find any content that is similar to the user query, then calculate the similarity and find the one that has higher similarity to include in the prompt, that way even if the language model semantic memory doesn't have the data about this it wont hallucinate and will reply using the data from the "wiki book".

## Conclusion

- RAG acts like a wiki book for language models. Allowing them to access information outside their cutoff dates (presumably "opening their world").
- RAG is actually just a bunch of array of numbers which resembles a coordinate of n dimensions.
- Process of mapping a text or a chunk of text into a coordinate is called embedding.
- RAG work by calculating similarity of the text's coordinates angle using cosine similarity formula.
- If the similarity hits [0.70] then it is considered "virtually similar" and highest similarity fed to the language model as an extra context to prevent hallucinations.
- Although what is implemented above is the most basic form of RAG called 'naive RAG' there are several RAG type which will be added in future articles or updated here.