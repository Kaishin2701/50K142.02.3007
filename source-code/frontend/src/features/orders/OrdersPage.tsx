import { useSession } from '../../app/auth';
import ManagerOrderHistory from './ManagerOrderHistory';
import EmployeeOrderTracking from './EmployeeOrderTracking';

export default function OrdersPage() {
  const { user } = useSession();
  return user?.vai_tro === 'Quản lý' ? (
    <ManagerOrderHistory />
  ) : (
    <EmployeeOrderTracking />
  );
}
