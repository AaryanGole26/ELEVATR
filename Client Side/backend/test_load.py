import spacy
try:
    nlp = spacy.load("en_core_web_md")
    print("SUCCESS: Model loaded")
except Exception as e:
    print(f"FAILURE: {e}")
