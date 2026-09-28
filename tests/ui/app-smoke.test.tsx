import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../src/client/App';

describe('application shell', () => {
  it('starts with a clean DOM', () => {
    expect(screen.queryByRole('heading', { name: 'Miramichi Timberwolves' })).not.toBeInTheDocument();
  });

  it('shows the team name', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Miramichi Timberwolves' })).toBeVisible();
  });
});
