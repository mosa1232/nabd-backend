import { Overview, Booklets, Exams, Courses, Students } from './Doctor.jsx';
import { Questions, Pearls, Assistants } from './Content.jsx';
import { Accounts, Doctors, Reps } from './People.jsx';

// section id -> component. Anything not listed here shows the "being moved" card.
const SECTIONS = {
  'p-overview': Overview,
  'p-booklets': Booklets,
  'p-exams': Exams,
  'p-courses': Courses,
  'p-students': Students,
  'p-questions': Questions,
  'p-pearls': Pearls,
  'p-assistants': Assistants,
  accounts: Accounts,
  doctors: Doctors,
  reps: Reps,
};
export default SECTIONS;
