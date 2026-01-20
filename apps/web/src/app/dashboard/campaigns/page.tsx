'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Send, Calendar, FileText, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: string;
  type: string;
  sentAt: string | null;
  scheduledAt: string | null;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  openCount: number;
  clickCount: number;
  bounceCount: number;
  createdAt: string;
}

function getStatusBadge(status: string) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    scheduled: 'bg-blue-100 text-blue-800',
    sending: 'bg-yellow-100 text-yellow-800',
    sent: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
        styles[status] || styles.draft
      }`}
    >
      {status}
    </span>
  );
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/campaigns');
      if (response.ok) {
        const data = await response.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const sentCampaigns = campaigns.filter((c) => c.status === 'sent');
  const scheduledCampaigns = campaigns.filter((c) => c.status === 'scheduled');
  const draftCampaigns = campaigns.filter((c) => c.status === 'draft');

  const calculateRate = (numerator: number, denominator: number) => {
    if (denominator === 0) return 0;
    return Math.round((numerator / denominator) * 1000) / 10;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Campaigns</h1>
          <p className="text-muted-foreground">
            Create and manage email campaigns
          </p>
        </div>
        <Link href="/dashboard/campaigns/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Campaign
          </Button>
        </Link>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Campaigns
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaigns.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sent</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sentCampaigns.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{scheduledCampaigns.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{draftCampaigns.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Campaigns</CardTitle>
          <CardDescription>
            View and manage all your email campaigns
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No campaigns yet</h3>
              <p className="mt-2 text-muted-foreground">
                Create your first campaign to start sending emails.
              </p>
              <Link href="/dashboard/campaigns/new">
                <Button className="mt-4">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Campaign
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Open Rate</TableHead>
                  <TableHead className="text-right">Click Rate</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => {
                  const openRate = calculateRate(
                    campaign.openCount,
                    campaign.deliveredCount || campaign.sentCount
                  );
                  const clickRate = calculateRate(
                    campaign.clickCount,
                    campaign.deliveredCount || campaign.sentCount
                  );

                  return (
                    <TableRow key={campaign.id}>
                      <TableCell>
                        <Link href={`/dashboard/campaigns/${campaign.id}`}>
                          <div className="hover:underline">
                            <p className="font-medium">{campaign.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {campaign.subject}
                            </p>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                      <TableCell className="capitalize">
                        {campaign.type.replace('_', ' ')}
                      </TableCell>
                      <TableCell className="text-right">
                        {campaign.sentCount > 0
                          ? campaign.sentCount.toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {campaign.sentCount > 0 ? `${openRate}%` : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {campaign.sentCount > 0 ? `${clickRate}%` : '-'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
