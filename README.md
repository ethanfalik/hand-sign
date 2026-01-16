# ASL Hand Sign Recognizer

brew install python@3.11

python3.11 -m venv venv3.11
source venv3.11/bin/activate

pip install --upgrade pip
pip install tensorflow-macos tensorflow-metal numpy opencv-python mediapipe==0.10.21

use (in order) - 
  python train_asl_model.py
  python train_hand_sign_classifier.py
  python hand_sign_recognizer.py

