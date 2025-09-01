CREATE TABLE workspace_access (
  workspace_id bigint REFERENCES workspaces(id) NOT NULL,
  shared_with_user_id uuid REFERENCES auth.users(id) NOT NULL,
  access_type character varying NOT NULL CHECK (access_type IN ('view', 'edit')),
  granted_by_uuid uuid REFERENCES auth.users(id) NOT NULL,
  granted_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (workspace_id, shared_with_user_id),
  CONSTRAINT no_self_sharing CHECK (
        (shared_with_user_id != granted_by_uuid) OR 
        (shared_with_user_id = granted_by_uuid AND access_type = 'edit')
    )
);

COMMENT ON TABLE workspace_access IS 'Manages access control for workspaces. 
1. Each workspace has View rights and edit rights.

2. Users with edit rights can:
2A. Give View rights or edit rights to other users.
2B. Edit the workspace name or description.
2C. Soft delete the workspace.
2D. Add, Edit or Soft delete -> goals, tasks, events, and files.

3. Users with View rights can only view:
3A. The workspace name and description.
3B. Goals (see goals.sql)
3C. Tasks (see tasks.sql)
3D. Events (see events.sql)
3E. Files stored in gitea repository';

-- Indexes forworkspace_access
CREATE INDEX workspace_access_shared_with_user_id_idx ON public.workspace_access USING btree (shared_with_user_id);
CREATE INDEX workspace_access_granted_by_uuid_idx ON public.workspace_access USING btree (granted_by_uuid);

-- RLS forworkspace_access
ALTER TABLE workspace_access ENABLE ROW LEVEL SECURITY;

-- Policy for selecting data
CREATE POLICY "Users can view workspace access" ONworkspace_access
AS PERMISSIVE
FOR SELECT 
TO authenticated 
USING (
    true
);

-- Policy for inserting data
CREATE POLICY "Users with edit access can create shares" ONworkspace_access
AS PERMISSIVE
FOR INSERT 
TO authenticated 
WITH CHECK (
    EXISTS (
        SELECT 1
        FROMworkspace_access AS ma
        WHERE ma.workspace_id =workspace_access.workspace_id
          AND ma.shared_with_user_id = auth.uid()
          AND ma.access_type = 'edit'
    )
);

-- Policy for deleting data
CREATE POLICY "Users with edit access can delete shares" ONworkspace_access
AS PERMISSIVE
FOR DELETE 
TO authenticated 
USING (
    EXISTS (
        SELECT 1
        FROMworkspace_access AS ma
        WHERE ma.workspace_id =workspace_access.workspace_id
          AND ma.shared_with_user_id = auth.uid()
          AND ma.access_type = 'edit'
    )
);

--Allow the Creator to Have Edit Access: When a new workspace is created, the user who creates it should automatically be granted edit access.
CREATE POLICY "Allow creators to insert initial access" ONworkspace_access
AS PERMISSIVE
FOR INSERT 
TO authenticated 
WITH CHECK (
    (auth.uid() = granted_by_uuid AND access_type = 'edit')
    OR
    (workspace_id IN (
        SELECT workspace_access_1.workspace_id
        FROMworkspace_access workspace_access_1
        WHERE workspace_access_1.shared_with_user_id = auth.uid() AND workspace_access_1.access_type = 'edit'
    ))
);