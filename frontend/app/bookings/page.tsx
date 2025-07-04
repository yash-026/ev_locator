'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ArrowLeft, MapPin, Clock, Zap, XCircle, CheckCircle } from 'lucide-react'
import { format } from 'date-fns'

interface Booking {
  id: number
  station_id: number
  station_name: string
  station_address: string
  start_time: string
  end_time: string
  duration: number
  total_cost: number
  status: string
  slot_number: number
  charging_type: string
  power_consumption: number
  created_at: string
}

export default function BookingsPage() {
  const { user } = useUser()
  const router = useRouter()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      fetchBookings()
    }
  }, [user])

  const fetchBookings = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/bookings/user/${user?.id}`
      )
      const data = await response.json()
      setBookings(data)
      setLoading(false)
    } catch (error) {
      console.error('Error fetching bookings:', error)
      toast.error('Failed to load bookings')
      setLoading(false)
    }
  }

  const cancelBooking = async (bookingId: number) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/bookings/${bookingId}/cancel`,
        { method: 'PUT' }
      )

      if (response.ok) {
        toast.success('Booking cancelled successfully')
        fetchBookings()
      } else {
        toast.error('Failed to cancel booking')
      }
    } catch (error) {
      console.error('Error cancelling booking:', error)
      toast.error('Failed to cancel booking')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'completed': return 'bg-blue-100 text-blue-800'
      case 'cancelled': return 'bg-red-100 text-red-800'
      default: return 'bg-yellow-100 text-yellow-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <Zap className="h-4 w-4" />
      case 'completed': return <CheckCircle className="h-4 w-4" />
      case 'cancelled': return <XCircle className="h-4 w-4" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-4">
            <button
              onClick={() => router.push('/')}
              className="mr-4 p-2 rounded-md hover:bg-gray-100"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900">My Bookings</h1>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {bookings.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No bookings yet</h2>
            <p className="text-gray-600 mb-6">Start by booking a charging slot near you</p>
            <button
              onClick={() => router.push('/')}
              className="bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700"
            >
              Find Charging Stations
            </button>
          </div>
        ) : (
          <div className="grid gap-6">
            {bookings.map((booking) => (
              <div key={booking.id} className="bg-white rounded-lg shadow-md p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">{booking.station_name}</h3>
                    <div className="flex items-center text-gray-600 mt-1">
                      <MapPin className="h-4 w-4 mr-1" />
                      {booking.station_address}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(booking.status)}`}>
                      {getStatusIcon(booking.status)}
                      <span className="ml-1 capitalize">{booking.status}</span>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <div className="text-sm text-gray-500">Start Time</div>
                    <div className="font-medium">
                      {format(new Date(booking.start_time), 'MMM dd, yyyy')}
                      <br />
                      {format(new Date(booking.start_time), 'hh:mm a')}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Duration</div>
                    <div className="font-medium">{booking.duration} hours</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Charging Type</div>
                    <div className="font-medium">{booking.charging_type}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Total Cost</div>
                    <div className="font-medium text-green-600">₹{booking.total_cost}</div>
                  </div>
                </div>

                {booking.slot_number && (
                  <div className="mb-4">
                    <span className="text-sm text-gray-500">Slot Number: </span>
                    <span className="font-medium">#{booking.slot_number}</span>
                  </div>
                )}

                {booking.power_consumption > 0 && (
                  <div className="mb-4">
                    <span className="text-sm text-gray-500">Power Consumption: </span>
                    <span className="font-medium">{booking.power_consumption} kW</span>
                  </div>
                )}

                <div className="flex justify-between items-center pt-4 border-t">
                  <div className="text-sm text-gray-500">
                    Booked on {format(new Date(booking.created_at), 'MMM dd, yyyy')}
                  </div>
                  {booking.status === 'pending' && (
                    <button
                      onClick={() => cancelBooking(booking.id)}
                      className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 text-sm"
                    >
                      Cancel Booking
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}