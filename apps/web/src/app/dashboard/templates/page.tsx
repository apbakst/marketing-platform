'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, FileCode, MoreVertical, Copy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface Template {
  id: string;
  name: string;
  subject: string;
  htmlContent: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      const response = await fetch(`/api/templates/${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setTemplates(templates.filter((t) => t.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  const handleDuplicate = async (template: Template) => {
    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${template.name} (Copy)`,
          subject: template.subject,
          htmlContent: template.htmlContent,
        }),
      });
      if (response.ok) {
        fetchTemplates();
      }
    } catch (error) {
      console.error('Failed to duplicate template:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Email Templates</h1>
            <p className="text-muted-foreground">
              Create and manage reusable email templates
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 bg-muted rounded w-2/3" />
                <div className="h-4 bg-muted rounded w-full mt-2" />
              </CardHeader>
              <CardContent>
                <div className="h-24 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Email Templates</h1>
          <p className="text-muted-foreground">
            Create and manage reusable email templates
          </p>
        </div>
        <Link href="/dashboard/templates/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Button>
        </Link>
      </div>

      {templates.length === 0 ? (
        <Card className="p-12 text-center">
          <FileCode className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No templates yet</h3>
          <p className="mt-2 text-muted-foreground">
            Create your first email template to use in campaigns.
          </p>
          <Link href="/dashboard/templates/new">
            <Button className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Create Template
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="overflow-hidden">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <Link href={`/dashboard/templates/${template.id}`}>
                      <CardTitle className="text-lg hover:underline cursor-pointer">
                        {template.name}
                      </CardTitle>
                    </Link>
                    <CardDescription className="mt-1">
                      {template.subject || 'No subject set'}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDuplicate(template)}
                      title="Duplicate"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleDelete(template.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-muted rounded-md p-4 h-32 overflow-hidden">
                  {template.htmlContent ? (
                    <div
                      className="text-xs text-muted-foreground font-mono overflow-hidden"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 5,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {template.htmlContent.substring(0, 500)}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      No content
                    </div>
                  )}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Updated {new Date(template.updatedAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
