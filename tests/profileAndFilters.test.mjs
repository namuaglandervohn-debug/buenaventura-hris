import test from 'node:test';
import assert from 'node:assert/strict';
import { filterEmployeeRecords, emptyEmployeeFilters } from '../resources/ts/app/lib/employeeFilters.ts';

const employees = [
  { id: 'EMP-1', name: 'Jane Smith', position: 'Cashier', outlet: 'Main', status: 'Active', contact: '09123456789' },
  { id: 'EMP-2', name: 'John Smith', position: 'Cook', outlet: 'Main', status: 'Resigned', contact: '09999999999' },
  { id: 'EMP-3', name: 'Jane Doe', position: 'Cashier', outlet: 'Annex', status: 'Active', contact: '09876543210' },
];
test('employee search field and independent column filters compose with AND', () => {
  assert.deepEqual(filterEmployeeRecords(employees, 'jane', 'name', { ...emptyEmployeeFilters, outlet: 'Main', position: 'Cashier', status: 'Active' }).map(e => e.id), ['EMP-1']);
  assert.equal(filterEmployeeRecords(employees, 'main', 'name', emptyEmployeeFilters).length, 0);
  assert.equal(filterEmployeeRecords(employees, 'MAIN', 'all', emptyEmployeeFilters).length, 2);
  assert.deepEqual(filterEmployeeRecords(employees, '', 'all', { ...emptyEmployeeFilters, id: 'emp-3', contact: '5432' }).map(e => e.id), ['EMP-3']);
  assert.equal(filterEmployeeRecords(employees, '', 'all', emptyEmployeeFilters).length, 3);
});
