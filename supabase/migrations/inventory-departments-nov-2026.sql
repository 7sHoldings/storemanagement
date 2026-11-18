-- Department clean-up (Nov 2026): the app's Inventory departments use the
-- same 15 departments as the registers.
-- Existing departments are renamed in place (counted items keep their link),
-- the missing ones are added, and the order matches the register list.
-- Safe to run more than once.

begin;

update inventory_departments set name = 'Prerolls'     where name = 'Pre Rolls';
update inventory_departments set name = 'Kratom pills' where name = 'Hydroxy';
update inventory_departments set name = 'Vape Devices' where name = 'Devices';
update inventory_departments set name = 'Syringes'     where name = 'THCA';

-- Keep the department name stored on counted items in step.
update inventory_count_items i set department = d.name
  from inventory_departments d
 where i.department_id = d.id and i.department is distinct from d.name;

insert into inventory_departments (name, sort_order, display_order, is_active)
select v.name, v.ord, v.ord, true
  from (values
    ('Prerolls', 1), ('Kratom pills', 2), ('Kratom', 3), ('Cigars', 4), ('Vapes', 5),
    ('Syringes', 6), ('Gummies', 7), ('Glass pipes', 8), ('Coils & pods', 9), ('E-Liquids', 10),
    ('Vape Devices', 11), ('Pills', 12), ('Novelty', 13), ('Cigarettes', 14), ('Drinks', 15)
  ) as v(name, ord)
 where not exists (select 1 from inventory_departments d where d.name = v.name);

update inventory_departments d set sort_order = v.ord, display_order = v.ord, is_active = true
  from (values
    ('Prerolls', 1), ('Kratom pills', 2), ('Kratom', 3), ('Cigars', 4), ('Vapes', 5),
    ('Syringes', 6), ('Gummies', 7), ('Glass pipes', 8), ('Coils & pods', 9), ('E-Liquids', 10),
    ('Vape Devices', 11), ('Pills', 12), ('Novelty', 13), ('Cigarettes', 14), ('Drinks', 15)
  ) as v(name, ord)
 where d.name = v.name;

commit;
