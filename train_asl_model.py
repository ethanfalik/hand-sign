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
        cv2.waitKey(1)


def record_letter(letter):
    ensure_data_dir()
    cap = cv2.VideoCapture(0)

    collected = []

    with mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=1,
        min_detection_confidence=0.7,
        min_tracking_confidence=0.7,
    ) as hands:

        countdown(cap, letter)
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
                break

    cap.release()
    cv2.destroyAllWindows()

    if collected:
        file_path = os.path.join(DATA_DIR, f"{letter}.json")
        with open(file_path, "w") as f:
            json.dump(collected, f)
        print(f"Saved {len(collected)} samples for '{letter}'")
    else:
        print("No data saved.")


def record_all_letters():
    for letter in LETTERS:
        record_letter(letter)


def menu():
    while True:
        print("\n=== ASL DATA RECORDER ===")
        print("1. Train ONE letter")
        print("2. Train ALL letters (A–Z)")

        choice = input("Choose: ").strip()

        if choice == "1":
            letter = input("Letter (A–Z): ").upper().strip()
            if letter in LETTERS:
                record_letter(letter)
                print("Done. Exiting.")
                sys.exit(0)  # <-- FULLY closes the program
            else:
                print("Invalid letter.")

        elif choice == "2":
            record_all_letters()

if __name__ == "__main__":
    menu()
