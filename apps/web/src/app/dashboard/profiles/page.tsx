'use client';

import { useState } from 'react';
import { Plus, Search, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Mock data for demonstration
const mockProfiles = [
  {
    id: 'prof_1',
    email: 'john@example.com',
    firstName: 'John',
    lastName: 'Doe',
    createdAt: '2024-01-15T10:30:00Z',
    properties: { plan: 'premium' },
  },
  {
    id: 'prof_2',
    email: 'jane@example.com',
    firstName: 'Jane',
    lastName: 'Smith',
    createdAt: '2024-01-14T08:15:00Z',
    properties: { plan: 'free' },
  },
  {
    id: 'prof_3',
    email: 'bob@example.com',
    firstName: 'Bob',
    lastName: 'Wilson',
    createdAt: '2024-01-13T14:45:00Z',
    properties: { plan: 'premium' },
  },
];

export default function ProfilesPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProfiles = mockProfiles.filter(
    (profile) =>
      profile.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      profile.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      profile.lastName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Profiles</h1>
          <p className="text-muted-foreground">
            Manage your customer profiles
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Profile
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Profiles</CardTitle>
              <CardDescription>
                {filteredProfiles.length} profiles found
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search profiles..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProfiles.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell className="font-medium">{profile.email}</TableCell>
                  <TableCell>
                    {profile.firstName} {profile.lastName}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        profile.properties.plan === 'premium'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {profile.properties.plan}
                    </span>
                  </TableCell>
                  <TableCell>
                    {new Date(profile.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
