import os
import json
import numpy as np
from hand_sign_classifier import HandSignClassifier

DATA_DIR = "asl_data"
LETTERS = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")

EPOCHS = 100

def load_data():
    X, y = [], []
    for idx, letter in enumerate(LETTERS):
        file_path = os.path.join(DATA_DIR, f"{letter}.json")
        if not os.path.exists(file_path):
            continue
        with open(file_path, "r") as f:
            frames = json.load(f)
        for landmarks in frames:
            X.append(np.array(landmarks).flatten())
            y.append(idx)
    return np.array(X), np.array(y)

def main():
    X, y = load_data()
    print(f"Loaded data: {X.shape[0]} samples, {X.shape[1]} features")

    model_path = "asl_model.h5"

    # Always start fresh: delete old model if it exists
    if os.path.exists(model_path):
        os.remove(model_path)
        print("Old model deleted. Training from scratch.")

    classifier = HandSignClassifier(model_path=model_path, retrain=True)
    classifier.train(X, y, epochs=EPOCHS)

    print("New model trained and saved as asl_model.h5")

if __name__ == "__main__":
    main()
