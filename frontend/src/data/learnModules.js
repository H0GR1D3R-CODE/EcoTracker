// EcoTrack/frontend/src/data/learnModules.js
// Quiz questions for the climate literacy micro-course on the Learn page.
//
// Every question and its correct answer is derived DIRECTLY from the
// ARTICLES data already in pages/Learn.jsx (DEFRA, CEA India, Our World in
// Data, EPA figures already cited there) - nothing here is a new claim, it
// is the same cited facts asked back as a question. Keep these in sync if
// ARTICLES' own numbers ever change.
//
// Module keys match backend/routes/learn.py's VALID_MODULES exactly.

export const LEARN_MODULES = [
  {
    key: 'transport',
    questions: [
      {
        prompt: 'About how much CO₂ does one kilometre by petrol car emit?',
        options: ['0.041 kg', '0.082 kg', '0.141 kg', '0.71 kg'],
        correctIndex: 2,
      },
      {
        prompt: "Swapping one weekly car trip for the train cuts roughly what share of that journey's carbon?",
        options: ['30%', '50%', '70%', '90%'],
        correctIndex: 2,
      },
    ],
  },
  {
    key: 'electricity',
    questions: [
      {
        prompt: "Why does India's grid carry more carbon per unit than some other countries?",
        options: [
          "It's more expensive to generate",
          'So much of it still burns coal',
          'Transmission losses over long distances',
          'It carries about the same as anywhere else',
        ],
        correctIndex: 1,
      },
      {
        prompt: 'Roughly how many times cleaner is rooftop solar than the India grid, per unit?',
        options: ['2×', '5×', '14×', '50×'],
        correctIndex: 2,
      },
    ],
  },
  {
    key: 'diet',
    questions: [
      {
        prompt: 'About how much CO₂ does a non-vegetarian meal average?',
        options: ['1.1 kg', '1.7 kg', '3.3 kg', '8 kg'],
        correctIndex: 2,
      },
      {
        prompt: 'Swapping one meat meal a day for vegetarian saves close to how much CO₂ a month?',
        options: ['10 kg', '25 kg', '48 kg', '100 kg'],
        correctIndex: 2,
      },
    ],
  },
  {
    key: 'consumption',
    questions: [
      {
        prompt: "Where is most of a product's carbon actually spent?",
        options: ['While you use it', 'Making it, before it reaches you', 'Throwing it away', 'Shipping it home'],
        correctIndex: 1,
      },
      {
        prompt: 'About how much embedded CO₂ does a single small electronic item carry?',
        options: ['8 kg', '25 kg', '85 kg', '200 kg'],
        correctIndex: 2,
      },
    ],
  },
];
