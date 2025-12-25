import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { FileText, Plus, Clock, User } from 'lucide-react';

interface RawMaterialVersion {
  id: string;
  version_number: number;
  content: string;
  created_by: string | null;
  created_at: string;
  profile?: {
    full_name: string | null;
    email: string | null;
  };
}

interface RawMaterialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
}

export function RawMaterialsDialog({ open, onOpenChange, orderId }: RawMaterialsDialogProps) {
  const { user, hasRole } = useAuth();
  const [versions, setVersions] = useState<RawMaterialVersion[]>([]);
  const [newContent, setNewContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canEdit = hasRole('manufacture_lead') || hasRole('admin');

  useEffect(() => {
    if (open) {
      fetchVersions();
    }
  }, [open, orderId]);

  const fetchVersions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('raw_material_versions')
        .select('*')
        .eq('order_id', orderId)
        .order('version_number', { ascending: false });

      if (error) throw error;

      // Fetch profiles for each version
      const profileIds = [...new Set(data?.map(v => v.created_by).filter(Boolean))];
      let profileMap = new Map();
      
      if (profileIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', profileIds);
        
        profiles?.forEach(p => profileMap.set(p.id, p));
      }

      setVersions(data?.map(v => ({
        ...v,
        profile: v.created_by ? profileMap.get(v.created_by) : undefined
      })) || []);
    } catch (error) {
      console.error('Error fetching raw material versions:', error);
      toast.error('Failed to load raw materials');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!newContent.trim()) {
      toast.error('Please enter raw material details');
      return;
    }

    setSaving(true);
    try {
      const nextVersion = versions.length > 0 ? versions[0].version_number + 1 : 1;

      const { error } = await supabase
        .from('raw_material_versions')
        .insert({
          order_id: orderId,
          version_number: nextVersion,
          content: newContent.trim(),
          created_by: user?.id,
        });

      if (error) throw error;

      toast.success('Raw materials updated');
      setNewContent('');
      fetchVersions();
    } catch (error) {
      console.error('Error saving raw materials:', error);
      toast.error('Failed to save raw materials');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Raw Materials Timeline
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* New entry form */}
          {canEdit && (
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <h4 className="font-medium flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add New Version
              </h4>
              <Textarea
                placeholder="Enter raw material details for this order..."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={4}
              />
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving || !newContent.trim()}>
                  {saving ? 'Saving...' : 'Save Version'}
                </Button>
              </div>
            </div>
          )}

          {/* Version history */}
          <div className="space-y-2">
            <h4 className="font-medium text-muted-foreground">Version History</h4>
            
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : versions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No raw material records yet
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <div className="space-y-3 pr-4">
                  {versions.map((version, index) => (
                    <div 
                      key={version.id}
                      className={`p-4 border rounded-lg ${index === 0 ? 'border-primary/50 bg-primary/5' : 'bg-muted/20'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant={index === 0 ? 'default' : 'secondary'}>
                          Version {version.version_number}
                        </Badge>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {version.profile?.full_name || version.profile?.email || 'Unknown'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(version.created_at), 'PPp')}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{version.content}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
