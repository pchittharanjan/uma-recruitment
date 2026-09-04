import { redirect } from 'next/navigation';

/** In-app coffee chat entry was removed — notes come from Google Form + admin sheet upload. */
export default function CoffeeChatsRemovedPage() {
  redirect('/team');
}
