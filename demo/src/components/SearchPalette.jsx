import { useMemo, useState } from 'react';
import { fuzzyMatch, highlight } from '../utils/fuzzy.js';

const MAX_RESULTS = 80;

export function SearchPalette({ files, commands, onOpen, onRun }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  const results = useMemo(() => {
    const pool = [
      ...files.map((file) => ({
        key: `file:${file.path}`,
        label: file.name,
        detail: file.dir,
        kind: 'file',
        run: () => onOpen(file)
      })),
      ...commands.map((command) => ({
        key: `command:${command.id}`,
        label: command.label,
        detail: command.id,
        accel: command.accel,
        kind: 'command',
        run: () => onRun(command)
      }))
    ];

    if (!query.trim()) return pool.slice(0, MAX_RESULTS);
    return pool
      .map((entry) => ({ entry, match: fuzzyMatch(query, entry.label) }))
      .filter((item) => item.match)
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, MAX_RESULTS)
      .map((item) => ({ ...item.entry, match: item.match }));
  }, [query, files, commands, onOpen, onRun]);

  const active = results[Math.min(index, results.length - 1)];

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIndex((value) => (value + 1) % Math.max(results.length, 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIndex((value) => (value - 1 + results.length) % Math.max(results.length, 1));
    } else if (event.key === 'Enter' && active) {
      event.preventDefault();
      active.run();
    }
  };

  return (
    <div className="palette" role="dialog" aria-label="Search palette">
      <input
        autoFocus
        className="palette-input"
        value={query}
        placeholder="Go to file or run a command…"
        onChange={(event) => {
          setQuery(event.target.value);
          setIndex(0);
        }}
        onKeyDown={onKeyDown}
      />
      <ul className="palette-results">
        {results.map((entry, position) => (
          <li
            key={entry.key}
            className={position === index ? 'active' : ''}
            onMouseEnter={() => setIndex(position)}
            onClick={entry.run}
          >
            <span className="label">{highlight(entry.label, entry.match?.indices)}</span>
            <span className="detail">{entry.detail}</span>
            {entry.accel ? <kbd>{entry.accel}</kbd> : null}
          </li>
        ))}
        {!results.length ? <li className="empty">No matching files or commands</li> : null}
      </ul>
    </div>
  );
}
