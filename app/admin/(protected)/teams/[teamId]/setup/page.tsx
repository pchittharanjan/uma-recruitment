import { redirect } from 'next/navigation';

export default function TeamSetupRedirect() {
  redirect('/admin/import');
}
