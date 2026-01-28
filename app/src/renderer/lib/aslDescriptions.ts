// ASL Fingerspelling letter descriptions and tips
export const ASL_DESCRIPTIONS: Record<string, {
  description: string
  fingers: string
  tips: string[]
}> = {
  A: {
    description: "Fist with thumb on the side",
    fingers: "All fingers closed, thumb alongside fist",
    tips: ["Make a fist", "Thumb rests against side of index finger", "Keep palm facing forward"]
  },
  B: {
    description: "Flat hand, fingers together",
    fingers: "All 4 fingers up and together, thumb tucked",
    tips: ["Fingers straight up, pressed together", "Thumb tucked across palm", "Palm faces out"]
  },
  C: {
    description: "Curved hand like holding a cup",
    fingers: "All fingers curved, making a C shape",
    tips: ["Curve fingers and thumb", "Like you're holding a small cup", "Keep space between thumb and fingers"]
  },
  D: {
    description: "Index finger up, others touch thumb",
    fingers: "Index up, middle/ring/pinky touch thumb tip",
    tips: ["Point index finger straight up", "Other fingers form circle with thumb", "Like making an 'OK' but with index up"]
  },
  E: {
    description: "Fingers curled, thumb tucked",
    fingers: "All fingers curled down, thumb tucked under",
    tips: ["Curl all fingertips down to palm", "Thumb tucks underneath fingers", "Like a relaxed fist"]
  },
  F: {
    description: "OK sign - index touches thumb",
    fingers: "Index and thumb touch, other 3 fingers up",
    tips: ["Touch index fingertip to thumb tip", "Middle, ring, pinky spread up", "Like the 'OK' gesture"]
  },
  G: {
    description: "Pointing sideways",
    fingers: "Index and thumb point to the side",
    tips: ["Index finger points horizontally", "Thumb parallel below index", "Other fingers closed"]
  },
  H: {
    description: "Two fingers pointing sideways",
    fingers: "Index and middle point to side",
    tips: ["Index and middle together, pointing sideways", "Thumb rests on other fingers", "Like pointing with two fingers"]
  },
  I: {
    description: "Pinky up",
    fingers: "Only pinky finger up, others closed",
    tips: ["Make a fist, extend pinky only", "Pinky points straight up", "Palm faces forward"]
  },
  J: {
    description: "Pinky traces a J shape (dynamic)",
    fingers: "Pinky up, then draw a J in the air",
    tips: ["Start with I handshape (pinky up)", "Trace letter J downward and curve", "Movement goes down then hooks left"]
  },
  K: {
    description: "Peace sign with thumb between",
    fingers: "Index and middle up in V, thumb up between",
    tips: ["Make a peace sign", "Thumb sticks up between index and middle", "Ring and pinky closed"]
  },
  L: {
    description: "L shape - thumb and index at 90°",
    fingers: "Index up, thumb out to side, others closed",
    tips: ["Index points up", "Thumb points to the side", "Forms an L shape"]
  },
  M: {
    description: "Three fingers over thumb",
    fingers: "Index, middle, ring over thumb, pinky up",
    tips: ["Thumb tucked under 3 fingers", "Index, middle, ring drape over thumb", "Like counting 3 with thumb hidden"]
  },
  N: {
    description: "Two fingers over thumb",
    fingers: "Index and middle over thumb",
    tips: ["Thumb tucked under 2 fingers", "Index and middle drape over thumb", "Ring and pinky closed"]
  },
  O: {
    description: "Fingers form an O shape",
    fingers: "All fingertips touch thumb tip",
    tips: ["Curl all fingers to touch thumb", "Forms a circular O shape", "Keep the circle round"]
  },
  P: {
    description: "K sign pointing down",
    fingers: "Like K but pointing downward",
    tips: ["Same as K handshape", "Tilt wrist so fingers point down", "Middle finger points to floor"]
  },
  Q: {
    description: "G sign pointing down",
    fingers: "Like G but pointing downward",
    tips: ["Same as G handshape", "Tilt wrist so fingers point down", "Index and thumb point to floor"]
  },
  R: {
    description: "Crossed fingers",
    fingers: "Index and middle crossed",
    tips: ["Cross middle finger over index", "Like 'fingers crossed' for luck", "Other fingers closed"]
  },
  S: {
    description: "Fist with thumb across fingers",
    fingers: "Closed fist, thumb across front",
    tips: ["Make a tight fist", "Thumb wraps across front of fingers", "Palm faces forward"]
  },
  T: {
    description: "Thumb between index and middle",
    fingers: "Fist with thumb poking between index and middle",
    tips: ["Make a fist", "Tuck thumb between index and middle", "Thumb tip peeks out"]
  },
  U: {
    description: "Two fingers up together",
    fingers: "Index and middle up together",
    tips: ["Index and middle straight up, touching", "Other fingers closed", "Like a modified peace sign but together"]
  },
  V: {
    description: "Peace sign",
    fingers: "Index and middle up in V shape",
    tips: ["Classic peace sign", "Index and middle spread apart", "Other fingers closed"]
  },
  W: {
    description: "Three fingers up spread",
    fingers: "Index, middle, ring up and spread",
    tips: ["Three fingers up and spread", "Pinky and thumb touch", "Like showing number 3"]
  },
  X: {
    description: "Index finger hooked",
    fingers: "Index bent like a hook",
    tips: ["Make a fist", "Bend index finger at middle joint", "Like a hook or claw"]
  },
  Y: {
    description: "Thumb and pinky out",
    fingers: "Thumb and pinky extended, others closed",
    tips: ["Extend thumb and pinky only", "Middle three fingers closed", "Like a 'hang loose' or phone gesture"]
  },
  Z: {
    description: "Draw a Z in the air (dynamic)",
    fingers: "Index finger traces letter Z",
    tips: ["Point with index finger", "Draw Z: right, diagonal down-left, right", "Movement traces the letter Z"]
  },
}

// Get which fingers should be extended for each letter
export const FINGER_STATES: Record<string, {
  thumb: 'extended' | 'closed' | 'touching' | 'between'
  index: 'extended' | 'closed' | 'bent' | 'touching'
  middle: 'extended' | 'closed' | 'bent' | 'touching' | 'crossed'
  ring: 'extended' | 'closed' | 'touching'
  pinky: 'extended' | 'closed'
}> = {
  A: { thumb: 'closed', index: 'closed', middle: 'closed', ring: 'closed', pinky: 'closed' },
  B: { thumb: 'closed', index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended' },
  C: { thumb: 'extended', index: 'bent', middle: 'bent', ring: 'bent', pinky: 'bent' },
  D: { thumb: 'touching', index: 'extended', middle: 'touching', ring: 'touching', pinky: 'closed' },
  E: { thumb: 'closed', index: 'bent', middle: 'bent', ring: 'bent', pinky: 'bent' },
  F: { thumb: 'touching', index: 'touching', middle: 'extended', ring: 'extended', pinky: 'extended' },
  G: { thumb: 'extended', index: 'extended', middle: 'closed', ring: 'closed', pinky: 'closed' },
  H: { thumb: 'closed', index: 'extended', middle: 'extended', ring: 'closed', pinky: 'closed' },
  I: { thumb: 'closed', index: 'closed', middle: 'closed', ring: 'closed', pinky: 'extended' },
  J: { thumb: 'closed', index: 'closed', middle: 'closed', ring: 'closed', pinky: 'extended' },
  K: { thumb: 'between', index: 'extended', middle: 'extended', ring: 'closed', pinky: 'closed' },
  L: { thumb: 'extended', index: 'extended', middle: 'closed', ring: 'closed', pinky: 'closed' },
  M: { thumb: 'closed', index: 'closed', middle: 'closed', ring: 'closed', pinky: 'closed' },
  N: { thumb: 'closed', index: 'closed', middle: 'closed', ring: 'closed', pinky: 'closed' },
  O: { thumb: 'touching', index: 'touching', middle: 'touching', ring: 'touching', pinky: 'touching' },
  P: { thumb: 'between', index: 'extended', middle: 'extended', ring: 'closed', pinky: 'closed' },
  Q: { thumb: 'extended', index: 'extended', middle: 'closed', ring: 'closed', pinky: 'closed' },
  R: { thumb: 'closed', index: 'extended', middle: 'crossed', ring: 'closed', pinky: 'closed' },
  S: { thumb: 'closed', index: 'closed', middle: 'closed', ring: 'closed', pinky: 'closed' },
  T: { thumb: 'between', index: 'closed', middle: 'closed', ring: 'closed', pinky: 'closed' },
  U: { thumb: 'closed', index: 'extended', middle: 'extended', ring: 'closed', pinky: 'closed' },
  V: { thumb: 'closed', index: 'extended', middle: 'extended', ring: 'closed', pinky: 'closed' },
  W: { thumb: 'touching', index: 'extended', middle: 'extended', ring: 'extended', pinky: 'touching' },
  X: { thumb: 'closed', index: 'bent', middle: 'closed', ring: 'closed', pinky: 'closed' },
  Y: { thumb: 'extended', index: 'closed', middle: 'closed', ring: 'closed', pinky: 'extended' },
  Z: { thumb: 'closed', index: 'extended', middle: 'closed', ring: 'closed', pinky: 'closed' },
}
