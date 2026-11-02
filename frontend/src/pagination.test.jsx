import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Pagination from './components/Pagination';
import useMealPagination from './hooks/useMealPagination';

function List({ meals }) {
  const list = useMealPagination(meals);
  return <><input aria-label="Search" value={list.search} onChange={event => list.setSearch(event.target.value)} />
    <div data-testid="records">{list.items.map(item => <span key={item.id}>{item.name}</span>)}</div>
    <Pagination {...list} /></>;
}
const meals = Array.from({ length: 23 }, (_, i) => ({ id: i, name: `Meal ${i + 1}`, category: 'Main' }));
describe('shared menu pagination', () => {
  it('shows ten records, three on the last page, and resets search', () => {
    render(<List meals={meals} />);
    expect(screen.getByTestId('records').children).toHaveLength(10);
    expect(screen.getByRole('button', {name:'Previous'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button', {name:'Page 3'}));
    expect(screen.getByTestId('records').children).toHaveLength(3);
    expect(screen.getByRole('button', {name:'Next'})).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Search'), {target:{value:'Meal 23'}});
    expect(screen.getByTestId('records').children).toHaveLength(1);
    expect(screen.getByRole('button', {name:'Page 1'})).toHaveAttribute('aria-current','page');
  });
  it('clamps the page after records are removed', () => {
    const view = render(<List meals={meals} />);
    fireEvent.click(screen.getByRole('button', {name:'Page 3'}));
    view.rerender(<List meals={meals.slice(0, 11)} />);
    expect(screen.getByRole('button', {name:'Page 2'})).toHaveAttribute('aria-current','page');
    expect(screen.getByTestId('records').children).toHaveLength(1);
  });
});
