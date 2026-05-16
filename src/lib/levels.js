export const LEVELS = [
  {
    id: 1,
    number: '01',
    name: 'Glance',
    displayName: 'Glance',
    pillLabel: 'GLANCE',
    pillMeta: '≈ 5 sec read',
  },
  {
    id: 2,
    number: '02',
    name: 'Summary',
    displayName: 'Summary',
    pillLabel: 'SUMMARY',
    pillMeta: '≈ 30 sec read',
  },
  {
    id: 3,
    number: '03',
    name: 'Read',
    displayName: 'Read',
    pillLabel: 'READ',
    pillMeta: '≈ 5 min read',
  },
  {
    id: 4,
    number: '04',
    name: 'Quiz',
    displayName: 'Quiz',
    pillLabel: 'QUIZ',
    pillMeta: 'Question 1 of 5',
  },
  {
    id: 5,
    number: '05',
    name: 'Dive',
    displayName: 'Deep Dive',
    pillLabel: 'DEEP DIVE',
    pillMeta: '',
  },
];

export function getLevel(id) {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}
