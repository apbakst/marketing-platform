'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  previewData?: Record<string, unknown>;
}

function renderPreview(
  html: string,
  data: Record<string, unknown>
): string {
  let result = html;

  // Simple variable replacement for preview
  const varPattern = /\{\{\s*([^}]+)\s*\}\}/g;

  result = result.replace(varPattern, (_, path) => {
    const parts = path.trim().split('.');
    let value: unknown = data;

    for (const part of parts) {
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') {
        value = (value as Record<string, unknown>)[part];
      } else {
        return '';
      }
    }

    if (value === null || value === undefined) return '';
    return String(value);
  });

  return result;
}

const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      text-align: center;
      padding: 20px 0;
      border-bottom: 1px solid #eee;
    }
    .content {
      padding: 30px 0;
    }
    .footer {
      text-align: center;
      padding: 20px 0;
      border-top: 1px solid #eee;
      font-size: 12px;
      color: #666;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #007bff;
      color: white;
      text-decoration: none;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>{{ organization.name }}</h1>
  </div>

  <div class="content">
    <p>Hi {{ profile.firstName }},</p>

    <p>Your email content goes here...</p>

    <p>
      <a href="#" class="button">Call to Action</a>
    </p>
  </div>

  <div class="footer">
    <p>© {{ organization.name }}</p>
    <p>
      <a href="{{ unsubscribe_url }}">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`;

const DEFAULT_PREVIEW_DATA = {
  profile: {
    email: 'john@example.com',
    firstName: 'John',
    lastName: 'Doe',
  },
  organization: {
    name: 'Acme Inc',
  },
  unsubscribe_url: '#unsubscribe',
};

export function TemplateEditor({
  value,
  onChange,
  previewData = DEFAULT_PREVIEW_DATA,
}: TemplateEditorProps) {
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  const [previewHtml, setPreviewHtml] = useState('');

  useEffect(() => {
    if (activeTab === 'preview') {
      setPreviewHtml(renderPreview(value, previewData));
    }
  }, [value, previewData, activeTab]);

  const handleInsertVariable = (variable: string) => {
    onChange(value + `{{ ${variable} }}`);
  };

  const handleLoadTemplate = () => {
    if (
      !value.trim() ||
      window.confirm('This will replace your current content. Continue?')
    ) {
      onChange(DEFAULT_TEMPLATE);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex rounded-md border border-input overflow-hidden">
          <button
            type="button"
            onClick={() => setActiveTab('code')}
            className={`px-4 py-2 text-sm transition-colors ${
              activeTab === 'code'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted'
            }`}
          >
            Code
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-2 text-sm transition-colors ${
              activeTab === 'preview'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted'
            }`}
          >
            Preview
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleLoadTemplate}
          >
            Load Template
          </Button>
        </div>
      </div>

      {/* Variable Insertion */}
      <Card className="bg-muted/50">
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Insert Variable</CardTitle>
        </CardHeader>
        <CardContent className="py-2">
          <div className="flex flex-wrap gap-2">
            {[
              'profile.firstName',
              'profile.lastName',
              'profile.email',
              'organization.name',
              'unsubscribe_url',
            ].map((variable) => (
              <button
                key={variable}
                type="button"
                onClick={() => handleInsertVariable(variable)}
                className="px-2 py-1 text-xs bg-background rounded border hover:bg-muted transition-colors"
              >
                {`{{ ${variable} }}`}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Editor / Preview */}
      <div className="border rounded-lg overflow-hidden" style={{ height: '500px' }}>
        {activeTab === 'code' ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-full p-4 font-mono text-sm bg-background resize-none focus:outline-none"
            placeholder="Enter your HTML template..."
            spellCheck={false}
          />
        ) : (
          <iframe
            srcDoc={previewHtml}
            className="w-full h-full bg-white"
            title="Email Preview"
            sandbox="allow-same-origin"
          />
        )}
      </div>
    </div>
  );
}

export { DEFAULT_TEMPLATE, DEFAULT_PREVIEW_DATA };
