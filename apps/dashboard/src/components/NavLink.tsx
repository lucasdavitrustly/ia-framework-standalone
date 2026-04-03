import { Link, useMatch } from 'react-router-dom';

interface NavLinkProps {
  to: string;
  label: string;
}

export default function NavLink({ to, label }: NavLinkProps) {
  const match = useMatch(to === '/' ? '/' : `${to}/*`);
  return (
    <Link
      to={to}
      className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        match
          ? 'bg-indigo-600 text-white'
          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
      }`}
    >
      {label}
    </Link>
  );
}
