import cv2
import mediapipe as mp
import numpy as np
import time
import os
import json

# MediaPipe hands setup
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils

DATA_DIR = "asl_data"  # Folder to store recorded data
LETTERS = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
DELAY = 3  # Countdown seconds
SAMPLES_PER_LETTER = 100  # Number of frames to record per letter
PAUSE_AFTER_LETTER = 1.5  # seconds pause after recording each letter

def record_asl_data():
    """
    Record hand landmark data for ASL letters with a responsive countdown.
    Saves data as JSON files in a structured folder.
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    
    cap = cv2.VideoCapture(0)

    with mp_hands.Hands(
        max_num_hands=1,
        min_detection_confidence=0.7,
        min_tracking_confidence=0.7
    ) as hands:

        for letter in LETTERS:
            # --- Smooth Countdown Before Recording ---
            for i in reversed(range(1, DELAY + 1)):
                start_time = time.time()
                while time.time() - start_time < 1:  # Each number lasts ~1 second
                    ret, frame = cap.read()
                    if not ret:
                        continue
                    frame = cv2.flip(frame, 1)
                    cv2.putText(frame, f"Get ready for '{letter}': {i}",
                                (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 255, 0), 4)
                    cv2.imshow("ASL Recorder", frame)
                    if cv2.waitKey(1) & 0xFF == ord('q'):
                        cap.release()
                        cv2.destroyAllWindows()
                        return

            # --- Record Data for This Letter ---
            print(f"Recording letter '{letter}'...")
            letter_data = []
            frames_recorded = 0

            while frames_recorded < SAMPLES_PER_LETTER:
                ret, frame = cap.read()
                if not ret:
                    continue

                frame = cv2.flip(frame, 1)
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = hands.process(rgb_frame)

                if result.multi_hand_landmarks:
                    hand_landmarks = result.multi_hand_landmarks[0]
                    landmarks = [[lm.x, lm.y, lm.z] for lm in hand_landmarks.landmark]
                    letter_data.append(landmarks)
                    frames_recorded += 1

                    # Optional: draw landmarks
                    # mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)

                # Show progress on screen
                cv2.putText(frame, f"Letter: {letter} ({frames_recorded}/{SAMPLES_PER_LETTER})",
                            (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                cv2.imshow("ASL Recorder", frame)

                if cv2.waitKey(1) & 0xFF == ord('q'):
                    cap.release()
                    cv2.destroyAllWindows()
                    return

            # --- Save recorded data ---
            file_path = os.path.join(DATA_DIR, f"{letter}.json")
            with open(file_path, "w") as f:
                json.dump(letter_data, f)

            print(f"Finished recording letter '{letter}'\n")

    cap.release()
    cv2.destroyAllWindows()
    print("All letters recorded successfully!")

if __name__ == "__main__":
    record_asl_data()
