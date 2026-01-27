// Lesson and exercise type definitions

export type ExerciseType =
  | 'sign-all'      // Sign all 4 letters shown
  | 'spell-it'      // Spell a word letter by letter
  | 'quick-fire'    // Timed rapid-fire letters
  | 'fill-gap'      // Sign the missing letter in a word
  | 'memory-chain'  // Memorize and sign a sequence

export interface Exercise {
  type: ExerciseType
  // For sign-all: the letters to sign
  letters?: string[]
  // For spell-it and fill-gap: the word
  word?: string
  // For fill-gap: index of missing letter
  gapIndex?: number
  // For memory-chain: the sequence to memorize
  sequence?: string[]
  // For quick-fire: time limit in seconds
  timeLimit?: number
}

export interface Lesson {
  id: string
  title: string
  description: string
  // Letters introduced in this lesson
  newLetters: string[]
  // All letters available (including from previous lessons)
  availableLetters: string[]
  exercises: Exercise[]
}

export interface Unit {
  id: string
  title: string
  lessons: Lesson[]
}

// Simple words using only specific letter sets
const WORDS: Record<string, string[]> = {
  'ABCDE': ['CAB', 'BED', 'ACE', 'BAD', 'DAD', 'ADD'],
  'ABCDEFGH': ['BEACH', 'BADGE', 'FACE', 'CAFE', 'HEAD', 'BEAD', 'DEAF', 'FADE'],
  'ABCDEFGHIJ': ['CHIEF', 'JUICE', 'JADED', 'CACHE'],
  'ABCDEFGHIJK': ['HIJACK', 'BACKED', 'JACKET'],
  'ABCDEFGHIJKL': ['BLACK', 'BLADE', 'CABLE', 'CHALK', 'CHILD', 'FLAKE'],
  'ABCDEFGHIJKLM': ['CLIMB', 'FLAME', 'MAGIC', 'MEDAL', 'MILKED'],
  'ABCDEFGHIJKLMNO': ['BACON', 'CAMEL', 'DOMAIN', 'FALCON', 'INCOME', 'LEMON'],
  'ABCDEFGHIJKLMNOP': ['CAPITAL', 'DOLPHIN', 'HELPFUL', 'PACKING'],
  'ABCDEFGHIJKLMNOPQ': ['BANQUET', 'BOUQUET'],
  'ABCDEFGHIJKLMNOPQR': ['BROTHER', 'CHAPTER', 'DOLPHIN', 'FOREARM', 'GRAPHIC'],
  'ABCDEFGHIJKLMNOPQRS': ['CHAPTERS', 'GRAPHICS', 'BROTHERS', 'SPECTRUM'],
  'ABCDEFGHIJKLMNOPQRST': ['ABSTRACT', 'DISTRICT', 'SHORTCUT', 'STRAIGHT'],
  'ABCDEFGHIJKLMNOPQRSTU': ['ADJUSTER', 'CRUSHING', 'DOUBTERS', 'RESULTING'],
  'ABCDEFGHIJKLMNOPQRSTUV': ['ADVENTURE', 'DISCOVERY', 'SURVICATE'],
  'ABCDEFGHIJKLMNOPQRSTUVW': ['AFTERWARD', 'SNOWBOARD', 'WITHDRAW'],
  'ABCDEFGHIJKLMNOPQRSTUVWX': ['BEESWAX', 'COMPLEX'],
  'ABCDEFGHIJKLMNOPQRSTUVWXY': ['TAXONOMY', 'PROXY'],
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ': ['RECOGNIZE', 'AMAZING', 'BAPTIZE', 'ORGANIZE', 'FINALIZE'],
}

// Get words that only use the given letters
function getWordsForLetters(letters: string[]): string[] {
  const letterSet = new Set(letters)
  const sortedKey = [...letters].sort().join('')

  // Find the best matching word list
  for (const [key, words] of Object.entries(WORDS)) {
    if (key === sortedKey || letters.every(l => key.includes(l))) {
      return words.filter(word =>
        [...word].every(char => letterSet.has(char))
      )
    }
  }

  // Fallback: filter from all words
  const allWords = Object.values(WORDS).flat()
  return allWords.filter(word =>
    [...word].every(char => letterSet.has(char))
  )
}

// Generate exercises for a lesson
function generateExercises(newLetters: string[], allLetters: string[]): Exercise[] {
  const exercises: Exercise[] = []
  const words = getWordsForLetters(allLetters)

  // 1. Sign All - practice the new letters
  exercises.push({
    type: 'sign-all',
    letters: [...newLetters],
  })

  // 2. Sign All - mix of new and old letters
  if (allLetters.length >= 4) {
    const mixed = shuffle([...newLetters, ...pickRandom(allLetters.filter(l => !newLetters.includes(l)), 4 - newLetters.length)])
    exercises.push({
      type: 'sign-all',
      letters: mixed.slice(0, 4),
    })
  }

  // 3. Spell It - if we have words available
  if (words.length > 0) {
    const word = pickRandom(words.filter(w => w.length <= 5), 1)[0] || words[0]
    exercises.push({
      type: 'spell-it',
      word: word,
    })
  }

  // 4. Fill the Gap
  if (words.length > 0) {
    const word = pickRandom(words.filter(w => w.length >= 3 && w.length <= 6), 1)[0] || words[0]
    exercises.push({
      type: 'fill-gap',
      word: word,
      gapIndex: Math.floor(Math.random() * word.length),
    })
  }

  // 5. Memory Chain (after enough letters learned)
  if (allLetters.length >= 4) {
    exercises.push({
      type: 'memory-chain',
      sequence: pickRandom(allLetters, Math.min(3, allLetters.length)),
    })
  }

  // 6. Quick Fire (only when there are enough letters to be interesting)
  if (allLetters.length >= 5) {
    exercises.push({
      type: 'quick-fire',
      letters: [...allLetters],
      timeLimit: 30,
    })
  }

  return exercises
}

// Shuffle array
function shuffle<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// Pick random items from array
function pickRandom<T>(array: T[], count: number): T[] {
  const shuffled = shuffle(array)
  return shuffled.slice(0, count)
}

// Generate the full curriculum
export function generateCurriculum(): Unit[] {
  const units: Unit[] = []

  // Split into units of ~5 letters each
  const unitDefinitions = [
    { id: 'unit-1', title: 'Basics', letters: ['A', 'B', 'C', 'D', 'E'] },
    { id: 'unit-2', title: 'Building Up', letters: ['F', 'G', 'H', 'I', 'J'] },
    { id: 'unit-3', title: 'Keep Going', letters: ['K', 'L', 'M', 'N', 'O'] },
    { id: 'unit-4', title: 'More Letters', letters: ['P', 'Q', 'R', 'S', 'T'] },
    { id: 'unit-5', title: 'Final Stretch', letters: ['U', 'V', 'W', 'X', 'Y', 'Z'] },
  ]

  let learnedLetters: string[] = []

  for (const unitDef of unitDefinitions) {
    const lessons: Lesson[] = []

    // Split unit letters into lessons of 2-3 letters
    const lessonGroups: string[][] = []
    for (let i = 0; i < unitDef.letters.length; i += 2) {
      lessonGroups.push(unitDef.letters.slice(i, i + 2))
    }

    for (let i = 0; i < lessonGroups.length; i++) {
      const newLetters = lessonGroups[i]
      const availableLetters = [...learnedLetters, ...newLetters]

      lessons.push({
        id: `${unitDef.id}-lesson-${i + 1}`,
        title: `Letters ${newLetters.join(' & ')}`,
        description: `Learn to sign ${newLetters.join(' and ')}`,
        newLetters,
        availableLetters,
        exercises: generateExercises(newLetters, availableLetters),
      })

      learnedLetters = [...learnedLetters, ...newLetters]
    }

    // Add a review lesson at the end of each unit
    const reviewExercises: Exercise[] = [
      {
        type: 'sign-all',
        letters: shuffle(unitDef.letters).slice(0, 4),
      },
      {
        type: 'memory-chain',
        sequence: pickRandom(unitDef.letters, 4),
      },
    ]

    // Only add Quick Fire if there are enough letters
    if (learnedLetters.length >= 5) {
      reviewExercises.push({
        type: 'quick-fire',
        letters: unitDef.letters,
        timeLimit: 45,
      })
    }

    lessons.push({
      id: `${unitDef.id}-review`,
      title: 'Unit Review',
      description: `Practice all letters: ${unitDef.letters.join(', ')}`,
      newLetters: [],
      availableLetters: learnedLetters,
      exercises: reviewExercises,
    })

    units.push({
      id: unitDef.id,
      title: unitDef.title,
      lessons,
    })
  }

  return units
}

// Get exercise type display name
export function getExerciseTypeName(type: ExerciseType): string {
  switch (type) {
    case 'sign-all': return 'Sign All'
    case 'spell-it': return 'Spell It'
    case 'quick-fire': return 'Quick Fire'
    case 'fill-gap': return 'Fill the Gap'
    case 'memory-chain': return 'Memory Chain'
  }
}

// Get exercise type description
export function getExerciseTypeDescription(type: ExerciseType): string {
  switch (type) {
    case 'sign-all': return 'Sign each letter shown'
    case 'spell-it': return 'Spell the word letter by letter'
    case 'quick-fire': return 'Sign as many letters as you can before time runs out'
    case 'fill-gap': return 'Sign the missing letter'
    case 'memory-chain': return 'Memorize the sequence, then sign it'
  }
}
