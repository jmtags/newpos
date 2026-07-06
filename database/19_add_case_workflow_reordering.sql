-- Persist drag-and-drop ordering for Case Management workflow groups and columns.
-- Run after database/18_add_configurable_case_workflow.sql.

create or replace function public.case_workflow_reorder(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  group_item jsonb;
  column_item jsonb;
  target_group_id uuid;
begin
  if not public.case_is_privileged_user() then
    return jsonb_build_object(
      'success', false,
      'message', 'Only administrators and managers can reorder workflows.'
    );
  end if;

  for group_item in
    select value
    from jsonb_array_elements(coalesce(payload->'groups', '[]'::jsonb))
  loop
    update public.case_workflow_groups
    set sort_order = (group_item->>'sort_order')::integer
    where id = (group_item->>'id')::uuid;

    if not found then
      raise exception 'Workflow group was not found.';
    end if;
  end loop;

  for column_item in
    select value
    from jsonb_array_elements(coalesce(payload->'columns', '[]'::jsonb))
  loop
    target_group_id := nullif(column_item->>'group_id', '')::uuid;

    if target_group_id is not null and not exists (
      select 1
      from public.case_workflow_groups
      where id = target_group_id
        and is_active = true
    ) then
      raise exception 'The selected workflow group was not found.';
    end if;

    update public.case_workflow_columns
    set
      group_id = target_group_id,
      sort_order = (column_item->>'sort_order')::integer
    where id = (column_item->>'id')::uuid;

    if not found then
      raise exception 'Workflow column was not found.';
    end if;
  end loop;

  return public.case_workflow_list();
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object(
      'success', false,
      'message', 'The workflow ordering request contains invalid values.'
    );
  when others then
    return jsonb_build_object(
      'success', false,
      'message', sqlerrm
    );
end;
$$;

revoke all on function public.case_workflow_reorder(jsonb) from public;
grant execute on function public.case_workflow_reorder(jsonb) to authenticated;

notify pgrst, 'reload schema';
