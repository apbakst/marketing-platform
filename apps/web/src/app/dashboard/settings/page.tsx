'use client';

import { useState } from 'react';
import { Copy, Eye, EyeOff, Plus, Trash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const mockApiKeys = [
  {
    id: 'key_1',
    name: 'Production Public Key',
    type: 'public',
    prefix: 'pk_a1b2c3d4',
    lastUsed: '2024-01-15T10:30:00Z',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'key_2',
    name: 'Production Secret Key',
    type: 'secret',
    prefix: 'sk_x9y8z7w6',
    lastUsed: '2024-01-15T09:15:00Z',
    createdAt: '2024-01-01T00:00:00Z',
  },
];

const mockProviders = [
  {
    id: 'prov_1',
    name: 'Primary SES',
    type: 'ses',
    isActive: true,
    isDefault: true,
    healthStatus: 'healthy',
    dailyLimit: 50000,
    currentDailyUsage: 12345,
  },
  {
    id: 'prov_2',
    name: 'Backup SendGrid',
    type: 'sendgrid',
    isActive: true,
    isDefault: false,
    healthStatus: 'healthy',
    dailyLimit: 100000,
    currentDailyUsage: 0,
  },
];

export default function SettingsPage() {
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const toggleKeyVisibility = (keyId: string) => {
    setShowKeys((prev) => ({ ...prev, [keyId]: !prev[keyId] }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your organization settings
        </p>
      </div>

      {/* Organization Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>
            Basic organization settings and preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Organization Name</label>
              <Input defaultValue="Demo Organization" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Timezone</label>
              <Input defaultValue="America/New_York" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Default From Name</label>
              <Input defaultValue="Demo Team" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Default From Email</label>
              <Input defaultValue="hello@demo.example.com" />
            </div>
          </div>
          <Button>Save Changes</Button>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>
                Manage your API keys for accessing the platform
              </CardDescription>
            </div>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Create Key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockApiKeys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{key.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        key.type === 'public'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {key.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
                    <span>
                      {showKeys[key.id]
                        ? `${key.prefix}...xxxx`
                        : '••••••••••••'}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => toggleKeyVisibility(key.id)}
                    >
                      {showKeys[key.id] ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Last used: {new Date(key.lastUsed).toLocaleDateString()}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="text-destructive">
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Email Providers */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Email Providers</CardTitle>
              <CardDescription>
                Configure email service providers for sending emails
              </CardDescription>
            </div>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Provider
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockProviders.map((provider) => (
              <div
                key={provider.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{provider.name}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800 uppercase">
                      {provider.type}
                    </span>
                    {provider.isDefault && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Default
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        provider.healthStatus === 'healthy'
                          ? 'bg-green-100 text-green-800'
                          : provider.healthStatus === 'degraded'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {provider.healthStatus}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Usage: {provider.currentDailyUsage.toLocaleString()} /{' '}
                    {provider.dailyLimit.toLocaleString()} daily
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    Configure
                  </Button>
                  {!provider.isDefault && (
                    <Button variant="ghost" size="icon" className="text-destructive">
                      <Trash className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
