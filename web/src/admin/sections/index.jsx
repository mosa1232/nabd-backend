import { Overview, Booklets, Exams, Courses, Students } from './Doctor.jsx';
import { Questions, Pearls, Assistants } from './Content.jsx';
import { Accounts, Doctors, Reps } from './People.jsx';
import { Catalog, Students as StudentsAdmin, Bans, Notifications } from './Staff.jsx';
import { Roles, Admins, Logs } from './System.jsx';
import { Overview as StatsOverview } from './Overview.jsx';
import { Support, MyProfile } from './Support.jsx';
import { RepCodes, ResellerOverview, ResellerSales, ResellerCodes } from './Codes.jsx';

import { Store, Summer, Media, ImportExport, Resellers } from './Shop.jsx';

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
  overview: StatsOverview,
  support: Support,
  me: MyProfile,
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
  store: Store,
  summer: Summer,
  media: Media,
  importexport: ImportExport,
  resellers: Resellers,
};
export default SECTIONS;
