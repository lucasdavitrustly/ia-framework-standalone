import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.tsx';
import Overview from './pages/Overview.tsx';
import TokenUsage from './pages/TokenUsage.tsx';
import Benchmarks from './pages/Benchmarks.tsx';
import Config from './pages/Config.tsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="tokens" element={<TokenUsage />} />
          <Route path="benchmarks" element={<Benchmarks />} />
          <Route path="config" element={<Config />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
