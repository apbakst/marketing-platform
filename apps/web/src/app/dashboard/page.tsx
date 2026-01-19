import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Users, Tags, Send, Mail } from 'lucide-react';

const stats = [
  {
    name: 'Total Profiles',
    value: '12,543',
    change: '+12%',
    changeType: 'positive',
    icon: Users,
  },
  {
    name: 'Active Segments',
    value: '24',
    change: '+3',
    changeType: 'positive',
    icon: Tags,
  },
  {
    name: 'Emails Sent (30d)',
    value: '45,231',
    change: '+8%',
    changeType: 'positive',
    icon: Mail,
  },
  {
    name: 'Active Campaigns',
    value: '8',
    change: '-2',
    changeType: 'negative',
    icon: Send,
  },
];

const recentCampaigns = [
  {
    id: '1',
    name: 'Welcome Series - Day 1',
    status: 'sent',
    sent: 1234,
    openRate: '42%',
    clickRate: '8.2%',
  },
  {
    id: '2',
    name: 'Product Launch Announcement',
    status: 'scheduled',
    sent: 0,
    openRate: '-',
    clickRate: '-',
  },
  {
    id: '3',
    name: 'Monthly Newsletter',
    status: 'draft',
    sent: 0,
    openRate: '-',
    clickRate: '-',
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your marketing platform
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.name}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p
                className={`text-xs ${
                  stat.changeType === 'positive'
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {stat.change} from last month
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Campaigns */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Campaigns</CardTitle>
          <CardDescription>
            Your latest email campaigns and their performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentCampaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="space-y-1">
                  <p className="font-medium">{campaign.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Status:{' '}
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        campaign.status === 'sent'
                          ? 'bg-green-100 text-green-800'
                          : campaign.status === 'scheduled'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {campaign.status}
                    </span>
                  </p>
                </div>
                <div className="flex gap-8 text-sm">
                  <div className="text-center">
                    <p className="font-medium">{campaign.sent}</p>
                    <p className="text-muted-foreground">Sent</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium">{campaign.openRate}</p>
                    <p className="text-muted-foreground">Open Rate</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium">{campaign.clickRate}</p>
                    <p className="text-muted-foreground">Click Rate</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
