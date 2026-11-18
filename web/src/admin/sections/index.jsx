import { Overview, Booklets, Exams, Courses, Students } from './Doctor.jsx';
import { Questions, Pearls, Assistants } from './Content.jsx';
import { Accounts, Doctors, Reps } from './People.jsx';
import { Catalog, Students as StudentsAdmin, Bans, Notifications } from './Staff.jsx';
import { Roles, Admins, Logs } from './System.jsx';
import { RepCodes, ResellerOverview, ResellerSales, ResellerCodes } from './Codes.jsx';

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
  roles: Roles,
  admins: Admins,
  logs: Logs,
  catalog: Catalog,
  students: StudentsAdmin,
  bans: Bans,
  notifications: Notifications,
  doctors: Doctors,
  reps: Reps,
  'rep-codes': RepCodes,
  'r-overview': ResellerOverview,
  'r-sales': ResellerSales,
  'r-codes': ResellerCodes,
};
export default SECTIONS;
