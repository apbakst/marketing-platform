'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  TemplateEditor,
  DEFAULT_TEMPLATE,
} from '@/components/template-editor/template-editor';

export default function NewTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [textContent, setTextContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          subject,
          htmlContent: htmlContent || undefined,
          textContent: textContent || undefined,
        }),
      });

      if (response.ok) {
        router.push('/dashboard/templates');
      }
    } catch (error) {
      console.error('Failed to create template:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Create Template</h1>
          <p className="text-muted-foreground">
            Design a reusable email template
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Template Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Template Name <span className="text-destructive">*</span>
                </label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Welcome Email"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="subject" className="text-sm font-medium">
                  Default Subject Line
                </label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g., Welcome to {{ organization.name }}!"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>HTML Content</CardTitle>
          </CardHeader>
          <CardContent>
            <TemplateEditor value={htmlContent} onChange={setHtmlContent} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plain Text Content (Optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Plain text version of the email for clients that don't support HTML..."
              className="w-full h-40 p-3 text-sm border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || !name.trim()}>
            <Save className="mr-2 h-4 w-4" />
            {isSubmitting ? 'Creating...' : 'Create Template'}
          </Button>
        </div>
      </form>
    </div>
  );
}
