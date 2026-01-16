import cv2
import mediapipe as mp
import numpy as np
import time
import os
import json
import sys


# ================= CONFIG =================
DATA_DIR = "asl_data"
SAMPLES_PER_LETTER = 100
COUNTDOWN_SECONDS = 3
LETTERS = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
# =========================================

mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils


def ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


def countdown(cap, letter):
    start = time.time()
    while True:
        ret, frame = cap.read()
        if not ret:
            continue

        frame = cv2.flip(frame, 1)
        remaining = COUNTDOWN_SECONDS - int(time.time() - start)

        if remaining <= 0:
            break

        cv2.putText(
            frame,
            f"Get ready for '{letter}' {remaining}",
            (50, 100),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.5,
            (0, 255, 0),
            3,
        )

        cv2.imshow("ASL Recorder", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            return False  # Return False if user cancelled during countdown
    return True


def record_sequence(letter_list):
    ensure_data_dir()
    
    cap = cv2.VideoCapture(0)
    
    # Track if user wants to quit entire program
    user_quit = False

    with mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=1,
        min_detection_confidence=0.7,
        min_tracking_confidence=0.7,
    ) as hands:

        for letter in letter_list:
            
            if not countdown(cap, letter):
                print("Recording aborted.")
                user_quit = True
                break

            collected = []
            print(f"Recording '{letter}'...")
            
            while len(collected) < SAMPLES_PER_LETTER:
                ret, frame = cap.read()
                if not ret:
                    continue

                frame = cv2.flip(frame, 1)
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = hands.process(rgb)

                if result.multi_hand_landmarks:
                    hand = result.multi_hand_landmarks[0]
                    landmarks = [[lm.x, lm.y, lm.z] for lm in hand.landmark]

                    if len(landmarks) == 21:
                        collected.append(landmarks)
                        mp_drawing.draw_landmarks(
                            frame, hand, mp_hands.HAND_CONNECTIONS
                        )

                cv2.putText(
                    frame,
                    f"{letter}: {len(collected)}/{SAMPLES_PER_LETTER}",
                    (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1,
                    (0, 255, 0),
                    2,
                )

                cv2.imshow("ASL Recorder", frame)

                if cv2.waitKey(1) & 0xFF == ord("q"):
                    print("Recording aborted.")
                    user_quit = True
                    break
            
            if user_quit:
                break

            # --- UPDATED: APPEND LOGIC ---
            if collected:
                file_path = os.path.join(DATA_DIR, f"{letter}.json")
                
            # --- UPDATED: APPEND LOGIC ---
            if collected:
                file_path = os.path.join(DATA_DIR, f"{letter}.json")
                
                # Check if we already have data for this letter
                if os.path.exists(file_path):
                    with open(file_path, "r") as f:
                        try:
                            existing_data = json.load(f)
                            # Combine old data with new data
                            collected = existing_data + collected
                        except json.JSONDecodeError:
                            print(f"Error reading {file_path}, starting fresh.")

                with open(file_path, "w") as f:
                    json.dump(collected, f)
                print(f"Total samples now saved for '{letter}': {len(collected)}")
            else:
                print("No data saved.")

    cap.release()
    cv2.destroyAllWindows()
    
    # --- FIX FOR FREEZING ---
    # This loop forces OpenCV to process the 'destroy' event on all OS types
    for i in range(5):
        cv2.waitKey(1)
        
    return user_quit


def menu():
    while True:
        print("\n=== ASL DATA RECORDER ===")
        print("1. Train ONE letter")
        print("2. Train ALL letters (A–Z)")

        choice = input("Choose: ").strip()

        if choice == "1":
            letter = input("Letter (A–Z): ").upper().strip()
            if letter in LETTERS:
                quit_program = record_sequence([letter])
                if quit_program:
                    sys.exit(0)
                print("Done. Exiting.")
                sys.exit(0)
            else:
                print("Invalid letter.")

        elif choice == "2":
            quit_program = record_sequence(LETTERS)
            if quit_program:
                print("Exiting program.")
                sys.exit(0)

if __name__ == "__main__":
    menu()