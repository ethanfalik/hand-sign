import cv2
import mediapipe as mp
from hand_sign_classifier import HandSignClassifier
import numpy as np

# MediaPipe hands setup
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils

FPS_COUNTER = True  # Show FPS on top-left

def main():
    # Load the classifier
    classifier = HandSignClassifier(model_path="asl_model.h5")

    cap = cv2.VideoCapture(0)

    prev_time = 0

    with mp_hands.Hands(
        max_num_hands=1,
        min_detection_confidence=0.7,
        min_tracking_confidence=0.7
    ) as hands:

        while True:
            ret, frame = cap.read()
            if not ret:
                continue

            frame = cv2.flip(frame, 1)
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = hands.process(rgb_frame)

            predicted_letter = ""

            if result.multi_hand_landmarks:
                hand_landmarks = result.multi_hand_landmarks[0]
                landmarks = [[lm.x, lm.y, lm.z] for lm in hand_landmarks.landmark]

                # Predict letter
                predicted_letter = classifier.predict(landmarks)

                # Draw landmarks on the hand
                mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)

            # Display prediction
            cv2.putText(frame, f"Prediction: {predicted_letter}", (10, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 255, 0), 3)

            # Display FPS
            if FPS_COUNTER:
                curr_time = cv2.getTickCount() / cv2.getTickFrequency()
                fps = 1 / (curr_time - prev_time) if prev_time else 0
                prev_time = curr_time
                cv2.putText(frame, f"FPS: {int(fps)}", (10, 90),
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)

            cv2.imshow("ASL Recognizer", frame)

            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
