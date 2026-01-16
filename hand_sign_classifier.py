import tensorflow as tf
import numpy as np
import os

class HandSignClassifier:
    def __init__(self, model_path="asl_model.h5", retrain=False, num_classes=26):
        self.model_path = model_path
        self.num_classes = num_classes

        # If retrain is True or model doesn't exist, create a new model
        if retrain or not os.path.exists(model_path):
            self.model = self._create_model()
        else:
            # Load existing model
            self.model = tf.keras.models.load_model(model_path)
            # If existing model output doesn't match current data, recreate
            if self.model.output_shape[-1] != self.num_classes:
                print(f"[INFO] Existing model has {self.model.output_shape[-1]} outputs, but current dataset has {self.num_classes}. Creating new model.")
                self.model = self._create_model()

    def _create_model(self):
        model = tf.keras.Sequential([
            tf.keras.layers.Input(shape=(21 * 3,)),  # 21 landmarks, x/y/z
            tf.keras.layers.Dense(128, activation="relu"),
            tf.keras.layers.Dense(128, activation="relu"),
            tf.keras.layers.Dense(self.num_classes, activation="softmax")  # output layer
        ])
        model.compile(
            optimizer="adam",
            loss="sparse_categorical_crossentropy",
            metrics=["accuracy"]
        )
        return model

    def train(self, X, y, epochs=30, batch_size=32):
        self.model.fit(X, y, epochs=epochs, batch_size=batch_size)
        self.model.save(self.model_path)

    def predict(self, landmarks):
        """
        landmarks: list of 21 (x,y,z) points
        returns: predicted letter (A-Z)
        """
        X = np.array(landmarks).reshape(1, -1)
        pred = np.argmax(self.model.predict(X, verbose=0))
        return chr(pred + ord("A"))
