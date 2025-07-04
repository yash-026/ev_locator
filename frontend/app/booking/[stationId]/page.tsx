'use client'

import { use, useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { ArrowLeft, MapPin, Zap, Clock, CreditCard } from 'lucide-react'

interface Station {
  id: number
  name: string
  address: string
  latitude: number
  longitude: number
  total_slots: number
  available_slots: number
  charging_types: string[]
  price_per_hour: number
  amenities: string[]
}

interface BookingForm {
  date: string
  startTime: string
  duration: number
  chargingType: string
}

export default function BookingPage({ params }: { params: Promise<{ stationId: string }> }) {
  const { stationId } = use(params)
  const { user } = useUser()
  const router = useRouter()
  const [station, setStation] = useState<Station | null>(null)
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState(false)
  
  const { register, handleSubmit, watch, formState: { errors } } = useForm<BookingForm>()
  const duration = watch('duration', 1)

  useEffect(() => {
    fetchStation()
  }, [stationId])

  const fetchStation = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/stations/${stationId}`)
      const data = await response.json()
      setStation(data)
      setLoading(false)
    } catch (error) {
      console.error('Error fetching station:', error)
      toast.error('Failed to load station details')
      setLoading(false)
    }
  }

  const onSubmit = async (data: BookingForm) => {
    if (!user || !station) return
    
    setBooking(true)
    try {
      const bookingData = {
        stationId: station.id,
        userId: user.id,
        userEmail: user.emailAddresses[0].emailAddress,
        userName: user.fullName,
        date: data.date,
        startTime: data.startTime,
        duration: data.duration,
        chargingType: data.chargingType,
        totalCost: station.price_per_hour * data.duration
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bookingData)
      })

      if (response.ok) {
        toast.success('Booking created successfully!')
        router.push('/bookings')
      } else {
        const error = await response.json()
        toast.error(error.message || 'Failed to create booking')
      }
    } catch (error) {
      console.error('Error creating booking:', error)
      toast.error('Failed to create booking')
    } finally {
      setBooking(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-500"></div>
      </div>
    )
  }

  if (!station) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Station not found</h2>
          <button
            onClick={() => router.push('/')}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  const totalCost = station.price_per_hour * duration

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-4">
            <button
              onClick={() => router.back()}
              className="mr-4 p-2 rounded-md hover:bg-gray-100"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Book Charging Slot</h1>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Station Details */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Station Details</h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-lg">{station.name}</h3>
                <div className="flex items-center text-gray-600 mt-1">
                  <MapPin className="h-4 w-4 mr-1" />
                  {station.address}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{station.available_slots}</div>
                  <div className="text-sm text-gray-600">Available Slots</div>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">₹{station.price_per_hour}</div>
                  <div className="text-sm text-gray-600">Per Hour</div>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Charging Types</h4>
                <div className="flex flex-wrap gap-2">
                  {station.charging_types.map((type) => (
                    <span key={type} className="bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full">
                      {type}
                    </span>
                  ))}
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Amenities</h4>
                <div className="flex flex-wrap gap-2">
                  {station.amenities.map((amenity) => (
                    <span key={amenity} className="bg-green-100 text-green-800 text-sm px-3 py-1 rounded-full">
                      {amenity}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Booking Form */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Book Your Slot</h2>
            
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  {...register('date', { required: 'Date is required' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                {errors.date && (
                  <p className="text-red-500 text-sm mt-1">{errors.date.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  {...register('startTime', { required: 'Start time is required' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                {errors.startTime && (
                  <p className="text-red-500 text-sm mt-1">{errors.startTime.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Duration (hours)
                </label>
                <select
                  {...register('duration', { required: 'Duration is required' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value={1}>1 hour</option>
                  <option value={2}>2 hours</option>
                  <option value={3}>3 hours</option>
                  <option value={4}>4 hours</option>
                  <option value={6}>6 hours</option>
                  <option value={8}>8 hours</option>
                </select>
                {errors.duration && (
                  <p className="text-red-500 text-sm mt-1">{errors.duration.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Charging Type
                </label>
                <select
                  {...register('chargingType', { required: 'Charging type is required' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Select charging type</option>
                  {station.charging_types.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                {errors.chargingType && (
                  <p className="text-red-500 text-sm mt-1">{errors.chargingType.message}</p>
                )}
              </div>

              {/* Cost Summary */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium mb-2">Cost Summary</h3>
                <div className="flex justify-between items-center text-sm">
                  <span>Rate per hour:</span>
                  <span>₹{station.price_per_hour}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span>Duration:</span>
                  <span>{duration} hour{duration > 1 ? 's' : ''}</span>
                </div>
                <hr className="my-2" />
                <div className="flex justify-between items-center font-bold">
                  <span>Total Cost:</span>
                  <span className="text-green-600">₹{totalCost}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={booking || station.available_slots === 0}
                className={`w-full py-3 px-4 rounded-md font-medium ${
                  booking || station.available_slots === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {booking ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Processing...
                  </div>
                ) : station.available_slots === 0 ? (
                  'No Slots Available'
                ) : (
                  <div className="flex items-center justify-center">
                    <CreditCard className="h-5 w-5 mr-2" />
                    Book & Pay ₹{totalCost}
                  </div>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}